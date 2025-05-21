import "dotenv/config";
import express from "express";
import { db, testConnections, syncDatabases } from "./config/database.js";
import cors from 'cors';

import authRoutes from "./routes/authRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get("/", (req, res) => {
  res.json({ message: "Selamat Datang di API Dompet Digital Terdistribusi!" });
});

app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);

app.use((err, req, res, next) => {
        console.error(err.stack);
        // Jika error CORS, kirim respons yang sesuai
        if (err.message === 'Tidak diizinkan oleh CORS') {
            return res.status(403).json({ error: 'Akses diblokir oleh kebijakan CORS.' });
        }
        res.status(500).send({ error: 'Terjadi kesalahan pada server!' });
    });

async function startServer() {
  try {
    await testConnections(); // Tes koneksi dulu

    // Jika koneksi berhasil, lanjutkan ke sinkronisasi database
    const forceDatabaseSync = false;
    await syncDatabases(forceDatabaseSync); // Ganti jadi false jika tidak ingin drop tabel

    app.listen(PORT, () => {
      console.log(`Server berjalan pada port ${PORT}`);
      console.log(
        `Terhubung ke Master DB: ${db.sequelizeMaster.config.database}`
      );
      console.log(
        `Terhubung ke Region Manado DB: ${db.sequelizeManado.config.database}`
      );
      console.log(
        `Terhubung ke Region Bitung DB: ${db.sequelizeBitung.config.database}`
      );
      if (forceDatabaseSync) {
        console.warn(
          "PERINGATAN: Sinkronisasi database dilakukan dengan force: true. Tabel mungkin telah dibuat ulang."
        );
      }
    });
  } catch (error) {
    console.error("Gagal memulai server atau sinkronisasi database:", error);
    process.exit(1);
  }
}

startServer();
