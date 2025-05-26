// controllers/transactionController.js
import { db } from "../config/database.js";
import { transferInterRegionSaga } from "../services/transactionService.js";

/**
 * Melakukan Top-Up Saldo untuk pengguna yang sedang login.
 */
export const topUpSaldo = async (req, res) => {
  const { nominal_topup } = req.body;
  const { user_id, region_id } = req.user; // Diambil dari middleware 'protect'

  if (
    !nominal_topup ||
    isNaN(parseFloat(nominal_topup)) ||
    parseFloat(nominal_topup) <= 0
  ) {
    return res
      .status(400)
      .json({
        message: "Nominal top-up tidak valid atau harus lebih besar dari 0.",
      });
  }

  const nominal = parseFloat(nominal_topup);
  const regionalModels = db.getRegionalModels(region_id);

  if (!regionalModels) {
    return res
      .status(500)
      .json({
        message: `Konfigurasi database regional untuk region ID ${region_id} tidak ditemukan.`,
      });
  }
  const { UserRegional, TransactionRegional } = regionalModels;
  const regionalDbInstance = db.getRegionalSequelize(region_id);

  const t = await regionalDbInstance.transaction();

  try {
    const user = await UserRegional.findOne({
      where: { user_id_master: user_id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!user) {
      await t.rollback();
      return res
        .status(404)
        .json({ message: "Data pengguna regional tidak ditemukan." });
    }

    const saldo_sebelum = parseFloat(user.saldo);
    const saldo_sesudah = saldo_sebelum + nominal;

    await user.update({ saldo: saldo_sesudah }, { transaction: t });

    const newTransaction = await TransactionRegional.create(
      {
        tipe_transaksi: "TOPUP",
        user_id_regional: user_id,
        nominal: nominal,
        saldo_sebelum: saldo_sebelum,
        saldo_sesudah: saldo_sesudah,
        status: "COMPLETED",
        keterangan: `Top-up saldo sebesar ${nominal}`,
      },
      { transaction: t }
    );

    await t.commit();

    const { GlobalTransactionLog } = db.master;
    try {
      await GlobalTransactionLog.create({
        transaction_id_regional: newTransaction.transaction_id,
        tipe_transaksi: "TOPUP",
        user_id_pengirim: user_id,
        nominal: nominal,
        waktu_transaksi_regional: newTransaction.waktu_transaksi,
        region_sumber_id: region_id,
        status: "COMPLETED",
        keterangan: `Top-up saldo untuk user ${user_id} di region ${region_id}`,
      });
    } catch (syncError) {
      console.error(
        "Gagal sinkronisasi top-up ke GlobalTransactionLog:",
        syncError
      );
    }

    res.status(200).json({
      message: "Top-up saldo berhasil!",
      saldo_sebelum: saldo_sebelum,
      saldo_sesudah: saldo_sesudah,
      nominal_topup: nominal,
    });
  } catch (error) {
    if (t && !t.finished) await t.rollback();
    console.error("Error saat top-up saldo:", error);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server saat top-up saldo." });
  }
};

/**
 * Melakukan Ambil Saldo (Withdrawal) untuk pengguna yang sedang login.
 */
export const ambilSaldo = async (req, res) => {
  const { nominal_withdrawal } = req.body;
  const { user_id, region_id } = req.user;

  if (
    !nominal_withdrawal ||
    isNaN(parseFloat(nominal_withdrawal)) ||
    parseFloat(nominal_withdrawal) <= 0
  ) {
    return res
      .status(400)
      .json({
        message:
          "Nominal withdrawal tidak valid atau harus lebih besar dari 0.",
      });
  }

  const nominal = parseFloat(nominal_withdrawal);
  const regionalModels = db.getRegionalModels(region_id);

  if (!regionalModels) {
    return res
      .status(500)
      .json({
        message: `Konfigurasi database regional untuk region ID ${region_id} tidak ditemukan.`,
      });
  }
  const { UserRegional, TransactionRegional } = regionalModels;
  const regionalDbInstance = db.getRegionalSequelize(region_id);

  const t = await regionalDbInstance.transaction();

  try {
    const user = await UserRegional.findOne({
      where: { user_id_master: user_id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!user) {
      await t.rollback();
      return res
        .status(404)
        .json({ message: "Data pengguna regional tidak ditemukan." });
    }

    const saldo_sebelum = parseFloat(user.saldo);

    if (saldo_sebelum < nominal) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: "Saldo tidak mencukupi untuk melakukan withdrawal." });
    }

    const saldo_sesudah = saldo_sebelum - nominal;

    await user.update({ saldo: saldo_sesudah }, { transaction: t });

    const newTransaction = await TransactionRegional.create(
      {
        tipe_transaksi: "WITHDRAWAL",
        user_id_regional: user_id,
        nominal: nominal,
        saldo_sebelum: saldo_sebelum,
        saldo_sesudah: saldo_sesudah,
        status: "COMPLETED",
        keterangan: `Withdrawal saldo sebesar ${nominal}`,
      },
      { transaction: t }
    );

    await t.commit();

    const { GlobalTransactionLog } = db.master;
    try {
      await GlobalTransactionLog.create({
        transaction_id_regional: newTransaction.transaction_id,
        tipe_transaksi: "WITHDRAWAL",
        user_id_pengirim: user_id,
        nominal: nominal,
        waktu_transaksi_regional: newTransaction.waktu_transaksi,
        region_sumber_id: region_id,
        status: "COMPLETED",
        keterangan: `Withdrawal saldo untuk user ${user_id} di region ${region_id}`,
      });
    } catch (syncError) {
      console.error(
        "Gagal sinkronisasi withdrawal ke GlobalTransactionLog:",
        syncError
      );
    }

    res.status(200).json({
      message: "Withdrawal saldo berhasil!",
      saldo_sebelum: saldo_sebelum,
      saldo_sesudah: saldo_sesudah,
      nominal_withdrawal: nominal,
    });
  } catch (error) {
    if (t && !t.finished) await t.rollback();
    console.error("Error saat ambil saldo:", error);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server saat ambil saldo." });
  }
};

/**
 * Mendapatkan riwayat transaksi untuk pengguna yang sedang login.
 */
export const getRiwayatTransaksi = async (req, res) => {
  const { user_id, region_id } = req.user;

  const regionalModels = db.getRegionalModels(region_id);
  if (!regionalModels) {
    return res
      .status(500)
      .json({
        message: `Konfigurasi database regional untuk region ID ${region_id} tidak ditemukan.`,
      });
  }
  const { TransactionRegional } = regionalModels;

  try {
    const transactions = await TransactionRegional.findAll({
      where: { user_id_regional: user_id },
      order: [["waktu_transaksi", "DESC"]],
    });

    if (!transactions || transactions.length === 0) {
      return res
        .status(200)
        .json({ message: "Tidak ada riwayat transaksi.", data: [] });
    }
    res.status(200).json({
      message: "Riwayat transaksi berhasil diambil.",
      data: transactions.map((tx) => tx.get({ plain: true })),
    });
  } catch (error) {
    console.error("Error saat mengambil riwayat transaksi:", error);
    res
      .status(500)
      .json({
        message:
          "Terjadi kesalahan pada server saat mengambil riwayat transaksi.",
      });
  }
};

/**
 * Melakukan transfer saldo ke pengguna lain.
 * Bisa intra-region atau inter-region.
 */
export const transferSaldo = async (req, res) => {
  const { username_penerima, nominal_transfer } = req.body;
  const {
    user_id: userIdPengirim,
    region_id: regionIdPengirim,
    username: usernamePengirim,
  } = req.user;

  if (!username_penerima || !nominal_transfer) {
    return res
      .status(400)
      .json({ message: "Username penerima dan nominal transfer wajib diisi." });
  }

  const nominal = parseFloat(nominal_transfer);
  if (isNaN(nominal) || nominal <= 0) {
    return res.status(400).json({ message: "Nominal transfer tidak valid." });
  }

  const { UserMaster, GlobalTransactionLog } = db.master;

  try {
    // 1. Cari data penerima di db_master
    const penerimaMaster = await UserMaster.findOne({
      where: { username: username_penerima },
    });
    if (!penerimaMaster) {
      return res
        .status(404)
        .json({
          message: `Pengguna penerima dengan username '${username_penerima}' tidak ditemukan.`,
        });
    }

    if (penerimaMaster.user_id === userIdPengirim) {
      return res
        .status(400)
        .json({ message: "Tidak bisa transfer ke diri sendiri." });
    }

    const userIdPenerima = penerimaMaster.user_id;
    const regionIdPenerima = penerimaMaster.region_id;
    const usernamePenerima = penerimaMaster.username;

    // 2. Tentukan apakah ini transfer intra-region atau inter-region
    if (regionIdPengirim === regionIdPenerima) {
      // --- TRANSFER INTRA-REGION ---
      console.log(
        `Memulai transfer intra-region dari ${usernamePengirim} ke ${usernamePenerima} di region ${regionIdPengirim}`
      );
      const regionalModels = db.getRegionalModels(regionIdPengirim);
      if (!regionalModels) {
        return res
          .status(500)
          .json({
            message: `Konfigurasi DB regional (ID: ${regionIdPengirim}) tidak ditemukan.`,
          });
      }
      const { UserRegional, TransactionRegional } = regionalModels;
      const regionalDbInstance = db.getRegionalSequelize(regionIdPengirim);

      const t = await regionalDbInstance.transaction();
      try {
        // Ambil data pengirim
        const userPengirim = await UserRegional.findOne({
          where: { user_id_master: userIdPengirim },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!userPengirim) {
          await t.rollback();
          return res
            .status(404)
            .json({ message: "Data regional pengirim tidak ditemukan." });
        }
        if (parseFloat(userPengirim.saldo) < nominal) {
          await t.rollback();
          return res
            .status(400)
            .json({ message: "Saldo pengirim tidak mencukupi." });
        }

        // Ambil data penerima
        const userPenerima = await UserRegional.findOne({
          where: { user_id_master: userIdPenerima },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!userPenerima) {
          await t.rollback();
          return res
            .status(404)
            .json({ message: "Data regional penerima tidak ditemukan." });
        }

        // Lakukan transfer
        const saldoSebelumPengirim = parseFloat(userPengirim.saldo);
        const saldoSesudahPengirim = saldoSebelumPengirim - nominal;
        await userPengirim.update(
          { saldo: saldoSesudahPengirim },
          { transaction: t }
        );

        const saldoSebelumPenerima = parseFloat(userPenerima.saldo);
        const saldoSesudahPenerima = saldoSebelumPenerima + nominal;
        await userPenerima.update(
          { saldo: saldoSesudahPenerima },
          { transaction: t }
        );

        // Catat transaksi untuk pengirim
        const txPengirim = await TransactionRegional.create(
          {
            tipe_transaksi: "TRANSFER_KELUAR",
            user_id_regional: userIdPengirim,
            user_id_terkait: userIdPenerima,
            region_id_user_terkait: regionIdPenerima,
            nominal: nominal,
            saldo_sebelum: saldoSebelumPengirim,
            saldo_sesudah: saldoSesudahPengirim,
            status: "COMPLETED",
            keterangan: `Transfer ke ${usernamePenerima}`,
          },
          { transaction: t }
        );

        // Catat transaksi untuk penerima
        await TransactionRegional.create(
          {
            tipe_transaksi: "TRANSFER_MASUK",
            user_id_regional: userIdPenerima,
            user_id_terkait: userIdPengirim,
            region_id_user_terkait: regionIdPengirim,
            nominal: nominal,
            saldo_sebelum: saldoSebelumPenerima,
            saldo_sesudah: saldoSesudahPenerima,
            status: "COMPLETED",
            keterangan: `Transfer diterima dari ${usernamePengirim}`,
          },
          { transaction: t }
        );

        await t.commit();

        // Sinkronisasi ke GlobalTransactionLog
        try {
          await GlobalTransactionLog.create({
            transaction_id_regional: txPengirim.transaction_id, // Bisa pakai ID transaksi pengirim
            tipe_transaksi: "TRANSFER",
            user_id_pengirim: userIdPengirim,
            user_id_penerima: userIdPenerima,
            nominal: nominal,
            waktu_transaksi_regional: txPengirim.waktu_transaksi,
            region_sumber_id: regionIdPengirim,
            region_tujuan_id: regionIdPenerima, // Sama dengan sumber untuk intra-region
            status: "COMPLETED",
            keterangan: `Transfer Intra-Region: Dari ${usernamePengirim} ke ${usernamePenerima} di Region ${regionIdPengirim}`,
          });
        } catch (syncError) {
          console.error(
            "Gagal sinkronisasi transfer intra-region ke GlobalTransactionLog:",
            syncError
          );
        }

        res.status(200).json({
          message: "Transfer intra-region berhasil!",
          saldo_pengirim_sekarang: saldoSesudahPengirim,
        });
      } catch (intraError) {
        if (t && !t.finished) await t.rollback();
        console.error("Error saat transfer intra-region:", intraError);
        res
          .status(500)
          .json({
            message: `Gagal melakukan transfer intra-region: ${intraError.message}`,
          });
      }
    } else {
      // --- TRANSFER INTER-REGION (Panggil SAGA Service) ---
      console.log(
        `Memulai transfer inter-region dari ${usernamePengirim} (Reg: ${regionIdPengirim}) ke ${usernamePenerima} (Reg: ${regionIdPenerima})`
      );
      try {
        const regionalModels = db.getRegionalModels(regionIdPengirim);
        if (!regionalModels) {
          return res
            .status(500)
            .json({
              message: `Konfigurasi DB regional pengirim (ID: ${regionIdPengirim}) tidak ditemukan.`,
            });
        }
        const { UserRegional } = regionalModels;

        const userPengirim = await UserRegional.findOne({
          where: { user_id_master: userIdPengirim },
        });

        if (!userPengirim) {
          return res
            .status(404)
            .json({ message: "Data regional pengirim tidak ditemukan." });
        }

        const saldoSebelumTransfer = parseFloat(userPengirim.saldo);

        const hasilSaga = await transferInterRegionSaga(
          {
            userId: userIdPengirim,
            regionId: regionIdPengirim,
            username: usernamePengirim,
          },
          {
            userId: userIdPenerima,
            regionId: regionIdPenerima,
            username: usernamePenerima,
          },
          nominal
        );

        const userPengirimAfter = await UserRegional.findOne({
          where: { user_id_master: userIdPengirim },
        });

        const saldoSesudahTransfer = userPengirimAfter
          ? parseFloat(userPengirimAfter.saldo)
          : saldoSebelumTransfer - nominal;

        res.status(200).json({
          message: "Inter-region transfer successful!",
          saldo_pengirim_sekarang: saldoSesudahTransfer,
        });
      } catch (sagaError) {
        console.error("Error saat transfer inter-region (SAGA):", sagaError);
        res
          .status(500)
          .json({
            message: `Transfer antar region gagal: ${sagaError.message}`,
          });
      }
    }
  } catch (error) {
    console.error("Error utama di fungsi transferSaldo:", error);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server saat proses transfer." });
  }
};
