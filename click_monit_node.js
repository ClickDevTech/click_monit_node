const fs = require('fs');

// Подключение классов
const Data = require('./src/Data');
const DataBase = require('./src/DataBase');
const data = new Data();
const statsSchema = require('./statsSchema');
const db = new DataBase('./stats.db', statsSchema);

// Подключение библиотеки для работы с веб-сокетами, для передачи информации и создания https сервера
const { io } = require("socket.io-client");
const file = fs.readFileSync('./settings.json');
const settings = JSON.parse(file);
const serverUrl = settings.controller_ip;
const name = settings.name;
const socket = io(serverUrl);

db.initialize();

setInterval(async () => {

    const { timestamp, cpu_load, total_memory, used_memory, rx_megabits, tx_megabits } = await data.getData();

    const charts = {
        name: name,
        timestamp,
        cpu_load,
        total_memory,
        used_memory,
        rx_megabits,
        tx_megabits,
    };

    db.insert(charts);

    socket.emit('charts', charts);

}, 2000);

socket.on('connect', async () => {
    console.log('\x1b[32mConnected to controller!\x1b[0m');
});

socket.on('start', async () => {

    console.log('start');

    const info = await data.getInfo();
    await socket.emit('info', info);

    const startData = await db.getData(300);
    startData[0].name = name;
    await socket.emit('charts', startData);

});

socket.on('periodSelected', async (selectedPeriod) => {

    console.log(`Selected period: ${selectedPeriod}`);

    const data = await db.getData(selectedPeriod);

    const days = {
        '300': 1, // 10 min
        '1800': 6, // 1h
        '10800': 36, // 6h
        '21600': 72, // 12h
        '43200': 144, // 24h
        '86400': 288, // 3d
        '302400': 1008, // 7d
    };

    let avg = [];

    for (let i = 0; i < data.length / days[selectedPeriod]; i++) {
        // Создаем объект для усредненных значений
        let avgStats = {
            timestamp: '',
            cpu_load: 0,
            total_memory: 0,
            used_memory: 0,
            rx_megabits: 0,
            tx_megabits: 0,
        };

        // Вычисляем начальный и конечный индексы для среза данных
        let startIndex = i * days[selectedPeriod];
        let endIndex = (i + 1) * days[selectedPeriod];

        // Срезаем нужные данные
        let slicedData = data.slice(startIndex, endIndex);

        // Вычисляем сумму значений по каждому полю
        slicedData.forEach((item) => {
            avgStats.cpu_load += parseFloat(item.cpu_load);
            avgStats.total_memory += parseFloat(item.total_memory);
            avgStats.used_memory += parseFloat(item.used_memory);
            avgStats.rx_megabits += parseFloat(item.rx_megabits);
            avgStats.tx_megabits += parseFloat(item.tx_megabits);
        });

        // Берем время по середине периода
        let middleIndex = Math.floor((startIndex + endIndex) / 2);

        // Рассчитываем средние значения
        avgStats.timestamp = data[middleIndex].timestamp;
        avgStats.cpu_load /= days[selectedPeriod];
        avgStats.total_memory /= days[selectedPeriod];
        avgStats.used_memory /= days[selectedPeriod];
        avgStats.rx_megabits /= days[selectedPeriod];
        avgStats.tx_megabits /= days[selectedPeriod];

        avgStats.cpu_load = parseFloat(avgStats.cpu_load.toFixed(2));
        avgStats.total_memory = parseFloat(avgStats.total_memory.toFixed(2));
        avgStats.used_memory = parseFloat(avgStats.used_memory.toFixed(2));
        avgStats.rx_megabits = parseFloat(avgStats.rx_megabits.toFixed(2));
        avgStats.tx_megabits = parseFloat(avgStats.tx_megabits.toFixed(2));

        // Добавляем усредненные значения в массив
        avg.push(avgStats);

    }

    avg[0].name = name;
    console.log('Все данные в таблице system_stats отправлены');
    await socket.emit('charts', avg);

});

socket.on('disconnect', () => {
    console.log('Connection Closed');
});