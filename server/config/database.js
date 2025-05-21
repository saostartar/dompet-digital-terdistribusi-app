// config/database.js
import "dotenv/config";
import { Sequelize, DataTypes } from "sequelize";

// Impor definisi model
import UserMasterModel from "../models/master/UserMaster.js";
import RegionModel from "../models/master/Region.js";
import GlobalTransactionLogModel from "../models/master/GlobalTransactionLog.js";
import UserRegionalModelDefinition from "../models/regional/UserRegional.js";
import TransactionRegionalModelDefinition from "../models/regional/TransactionRegional.js";

// --- Konfigurasi Instance Sequelize (sama seperti sebelumnya) ---
const sequelizeMaster = new Sequelize(
  process.env.DB_MASTER_NAME,
  process.env.DB_MASTER_USER,
  process.env.DB_MASTER_PASSWORD,
  {
    host: process.env.DB_MASTER_HOST,
    dialect: process.env.DB_MASTER_DIALECT,
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  }
);

const sequelizeManado = new Sequelize(
  process.env.DB_MANADO_NAME,
  process.env.DB_MANADO_USER,
  process.env.DB_MANADO_PASSWORD,
  {
    host: process.env.DB_MANADO_HOST,
    dialect: process.env.DB_MANADO_DIALECT,
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  }
);

const sequelizeBitung = new Sequelize(
  process.env.DB_BITUNG_NAME,
  process.env.DB_BITUNG_USER,
  process.env.DB_BITUNG_PASSWORD,
  {
    host: process.env.DB_BITUNG_HOST,
    dialect: process.env.DB_BITUNG_DIALECT,
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  }
);

const getRegionalSequelize = (regionId) => {
  const manadoId = parseInt(process.env.REGION_MANADO_ID, 10);
  const bitungId = parseInt(process.env.REGION_BITUNG_ID, 10);
  if (regionId === manadoId) return sequelizeManado;
  if (regionId === bitungId) return sequelizeBitung;
  console.error(
    `Koneksi database untuk region ID ${regionId} tidak ditemukan.`
  );
  return null;
};
// --- Akhir Konfigurasi Instance Sequelize ---

const db = {
  sequelizeMaster,
  sequelizeManado,
  sequelizeBitung,
  getRegionalSequelize,
  Sequelize, // Ekspor Sequelize class
  master: {},
  regionalManado: {}, // Model spesifik untuk Manado
  regionalBitung: {}, // Model spesifik untuk Bitung
  // Fungsi untuk mendapatkan model regional yang sudah diinisialisasi
  getRegionalModels: (regionId) => {
    const manadoId = parseInt(process.env.REGION_MANADO_ID, 10);
    const bitungId = parseInt(process.env.REGION_BITUNG_ID, 10);
    if (regionId === manadoId) return db.regionalManado;
    if (regionId === bitungId) return db.regionalBitung;
    console.error(
      `Model regional untuk region ID ${regionId} tidak ditemukan.`
    );
    return null;
  },
};

// Inisialisasi Model untuk DB Master
db.master.Region = RegionModel(sequelizeMaster, DataTypes);
db.master.UserMaster = UserMasterModel(sequelizeMaster, DataTypes);
db.master.GlobalTransactionLog = GlobalTransactionLogModel(
  sequelizeMaster,
  DataTypes
);

// Inisialisasi Model untuk DB Regional Manado
db.regionalManado.UserRegional = UserRegionalModelDefinition(
  sequelizeManado,
  DataTypes
);
db.regionalManado.TransactionRegional = TransactionRegionalModelDefinition(
  sequelizeManado,
  DataTypes
);

// Inisialisasi Model untuk DB Regional Bitung
db.regionalBitung.UserRegional = UserRegionalModelDefinition(
  sequelizeBitung,
  DataTypes
);
db.regionalBitung.TransactionRegional = TransactionRegionalModelDefinition(
  sequelizeBitung,
  DataTypes
);

// Menjalankan fungsi associate jika ada pada model-model master
Object.values(db.master)
  .filter((model) => typeof model.associate === "function")
  .forEach((model) => model.associate(db.master));

// Tidak ada asosiasi lintas database yang didefinisikan di level Sequelize untuk model regional.
// Asosiasi tersebut bersifat konseptual dan dikelola oleh logika aplikasi.

async function testConnections() {
  try {
    await sequelizeMaster.authenticate();
    console.log("Koneksi ke DB Master berhasil.");
    await sequelizeManado.authenticate();
    console.log("Koneksi ke DB Region Manado berhasil.");
    await sequelizeBitung.authenticate();
    console.log("Koneksi ke DB Region Bitung berhasil.");
  } catch (error) {
    console.error("Tidak dapat terhubung ke salah satu database:", error);
    throw error;
  }
}

// Fungsi untuk sinkronisasi database (membuat tabel jika belum ada)
// HATI-HATI: { force: true } akan menghapus tabel yang ada dan membuatnya ulang. Gunakan hanya untuk development.
// Untuk produksi, gunakan migrasi.
async function syncDatabases(forceSync = false) {
  try {
    console.log("Memulai sinkronisasi database master...");
    await sequelizeMaster.sync({ force: forceSync });
    console.log("Sinkronisasi database master berhasil.");

    console.log("Memulai sinkronisasi database regional Manado...");
    await sequelizeManado.sync({ force: forceSync });
    console.log("Sinkronisasi database regional Manado berhasil.");

    console.log("Memulai sinkronisasi database regional Bitung...");
    await sequelizeBitung.sync({ force: forceSync });
    console.log("Sinkronisasi database regional Bitung berhasil.");

    console.log("Semua database berhasil disinkronisasi.");
  } catch (error) {
    console.error("Gagal melakukan sinkronisasi database:", error);
    throw error;
  }
}

export { db, testConnections, syncDatabases };
