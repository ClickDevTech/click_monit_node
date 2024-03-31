const si = require("systeminformation");
const {format} = require("date-fns");
const fs = require("fs");

class Data {

    async getData () {
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
            const usedMem = (RAM.active / (1024 * 1024 * 1024)).toFixed(2);

            const result = {
                timestamp: formattedDate,
                cpu_load: cpu,
                total_memory: totalMem,
                used_memory: usedMem,
                rx_megabits: rxMegabits,
                tx_megabits: txMegabits,
            };

            return result;

        } catch (error) {
            console.error('Ошибка при получении данных:', error);
        };
    };

    async getInfo () {
        // Получаем информацию о диске
        const disk = await si.fsSize();

        const diskSize = (disk[0].size / (1024 * 1024 * 1024)).toFixed(2);
        const diskUsed = (disk[0].used / (1024 * 1024 * 1024)).toFixed(2);
        const diskAvailable = (disk[0].available / (1024 * 1024 * 1024)).toFixed(2);

        // Получаем имя хоста
        const hostName = (await si.osInfo()).hostname

        const file = fs.readFileSync('./settings.json');
        const settings = JSON.parse(file);

        const name = settings.name;

        const result = {
            name: name,
            hostName: hostName,
            diskSize: diskSize,
            diskUsed: diskUsed,
            diskAvailable: diskAvailable,
        };

        return result;

    };

};

module.exports = Data;

