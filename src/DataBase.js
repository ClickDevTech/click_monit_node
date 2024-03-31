const sqlite3 = require('sqlite3').verbose();

class DataBase {

    constructor(dbFilePath, schema) {
        this.dbFilePath = dbFilePath;
        this.schema = schema;
        this.db = new sqlite3.Database(this.dbFilePath);
    };

    initialize() {
        this.db.run(this.schema);
    };

    insert(data) {
        const { timestamp, cpu_load, total_memory, used_memory, rx_megabits, tx_megabits } = data;

        this.db.run(`
            INSERT INTO system_stats (
                timestamp, cpu_load, used_memory, total_memory, rx_megabits, tx_megabits
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, timestamp, cpu_load, used_memory, total_memory, rx_megabits, tx_megabits);
    };

    getData(period) {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM system_stats ORDER BY timestamp DESC LIMIT ${period}`, (err, rows) => {
                if (err) {
                    reject(err); // В случае ошибки, промис будет отклонен с ошибкой
                } else {
                    resolve(rows); // В случае успеха, промис будет выполнен с результатами запроса
                }
            });
        });
    };

}

module.exports = DataBase;