// Импорт systeminformation для получения информации о системе
const si = require('systeminformation');
// Чтобы форматировать дату и время
const { format } = require('date-fns');

const fs = require('fs')

const file = fs.readFileSync('./settings.json');
const settings = JSON.parse(file)

console.log(settings)

const name = settings.name;
const serverUrl = settings.controller_ip;

// Выводим значение name
console.log('Name:', name);

// Подключение библиотеки для работы с веб-сокетами, для передачи информации и создания https сервера
const { io } = require("socket.io-client");

const socket = io(serverUrl);

// Подключаем БД (sqlite была выбрана из-за её легкости)
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('stats.db');
const statsSchema = require('./statsSchema');

// Создание таблицы, если она не существует
db.run(statsSchema);

// Функция сохранения данных в БД
async function insertStats(stats) {
    const { timestamp, cpu_load, total_memory, used_memory, rx_megabits, tx_megabits } = stats;

    db.run(`
        INSERT INTO system_stats (
            timestamp, cpu_load, used_memory, total_memory, rx_megabits, tx_megabits
        ) VALUES (?, ?, ?, ?, ?, ?)
    `, timestamp, cpu_load, used_memory, total_memory, rx_megabits, tx_megabits);
}

// Функция сбора статистики
async function getStats() {
    try {
        const info = si;

        // Получаем время
        const time = info.time().current;
        const date = new Date(time);
        // Преобразуем в строку в локальном формате
        const formattedDate = format(date, 'dd.MM.yyyy HH:mm:ss');

        // Получаем информацию от сетевого интерфейса "по умолчанию"
        const networkStats = await info.networkStats();
        // Отдельные переменные для всех показателей.
        const rxBytes = networkStats[0].rx_sec;
        const txBytes = networkStats[0].tx_sec;
        // Переводим байты в мегабиты
        const rxMegabits = ((rxBytes * 8) / 1000000).toFixed(2);
        const txMegabits = ((txBytes * 8) / 1000000).toFixed(2);

        // Получаем информацию о текущей загрузке процессора
        const cpu = ((await info.currentLoad()).currentLoad).toFixed(2);

        // Получаем информацию об оперативной памяти
        const RAM = await info.mem();
        const totalMem = (RAM.total / (1024 * 1024 * 1024)).toFixed(2);
        const usedMem = (RAM.used / (1024 * 1024 * 1024)).toFixed(2);

        const result = {
            timestamp: formattedDate,
            cpu_load: cpu,
            total_memory: totalMem,
            used_memory: usedMem,
            rx_megabits: rxMegabits,
            tx_megabits: txMegabits,
        }

        return result;

    } catch (error) {
        console.error('Ошибка при получении статистики:', error);
    }
}

// Функция для сбора стартовой информации (которую не нужно часто обновлять)
async function sendInfo() {

    // Получаем информацию о диске
    const disk = await si.fsSize();

    const diskSize = (disk[0].size / (1024 * 1024 * 1024)).toFixed(2);
    const diskUsed = (disk[0].used / (1024 * 1024 * 1024)).toFixed(2);
    const diskAvailable = (disk[0].available / (1024 * 1024 * 1024)).toFixed(2);

    // Получаем имя хоста
    const hostName = (await si.osInfo()).hostname

    const info = {
        name: name,
        hostName: hostName,
        diskSize: diskSize,
        diskUsed: diskUsed,
        diskAvailable: diskAvailable,
    };

    await socket.emit('info', info);
}

setInterval(async () => {
    const data = await getStats();
    insertStats(data);

    // Отправка данных для графиков
    const charts = {
        name: name,
        timestamp: data.timestamp,
        cpu_load: data.cpu_load,
        used_memory: data.used_memory,
        rx_megabits: data.rx_megabits,
        tx_megabits: data.tx_megabits,
    }

    const widgets = {
        name: name,
        timestamp: data.timestamp,
        cpu_load: data.cpu_load,
        total_memory: data.total_memory,
        used_memory: data.used_memory,
        rx_megabits: data.rx_megabits,
        tx_megabits: data.tx_megabits,
    }

    socket.emit('charts', charts);

    // Виджеты всегда отображаем
    socket.emit('widgets', widgets);

}, 2000);

socket.on('connect', async () => {
    console.log('\x1b[32mConnected to controller!\x1b[0m');
});

socket.on('start', () => {

    console.log('start')

    // Используем колбэк
    db.all('SELECT * FROM system_stats ORDER BY timestamp DESC LIMIT 300', async (err, rows) => {
        if (err) {
            console.error('Ошибка при выборке данных:', err);
        } else {
            console.log('Все данные в таблице system_stats отправлены');
            // Отправляем текущие статистические данные при подключении клиента
            await sendInfo();
            rows[0].name = name
            await socket.emit('charts', rows);
        }
    });
});

socket.on('periodSelected', (selectedPeriod) => {
    console.log(`Selected period: ${selectedPeriod}`);

    // По запросу отправляем нужные данные
    db.all(`SELECT * FROM system_stats ORDER BY timestamp DESC LIMIT ${selectedPeriod}`, async (err, rows) => {
        if (err) {
            console.error('Ошибка при выборке данных:', err);
        } else {

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

            for (let i = 0; i < rows.length / days[selectedPeriod]; i++) {
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
                let slicedData = rows.slice(startIndex, endIndex);

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
                avgStats.timestamp = rows[middleIndex].timestamp
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

            avg[0].name = name
            console.log('Все данные в таблице system_stats отправлены');
            await socket.emit('charts', avg);
        }
    });
});

socket.on('disconnect', () => {
    console.log('Connection Closed');
});