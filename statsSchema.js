// statsSchema.js

module.exports = `
    CREATE TABLE IF NOT EXISTS system_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        cpu_load REAL,
        used_memory REAL,
        total_memory REAL,
        rx_megabits REAL,
        tx_megabits REAL
    )
`;