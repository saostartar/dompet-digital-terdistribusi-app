import { db } from '../config/database.js';

/**
 * Fungsi untuk melakukan kompensasi debit pengirim jika kredit penerima gagal.
 * @param {object} pengirimData - Data pengirim { userId, regionId }
 * @param {number} nominal - Nominal yang akan dikembalikan
 * @param {object} logPengirimAsli - Record transaksi pengirim yang perlu dikompensasi
 * @param {string} keteranganKompensasi - Keterangan untuk transaksi kompensasi
 */
async function compensateDebitPengirim(pengirimData, nominal, logPengirimAsli, keteranganKompensasi) {
    console.log(`Memulai kompensasi untuk user_id: ${pengirimData.userId} di region: ${pengirimData.regionId} sebesar: ${nominal}`);
    const regionalModelsPengirim = db.getRegionalModels(pengirimData.regionId);
    if (!regionalModelsPengirim) {
        console.error(`[KOMPENSASI GAGAL] Konfigurasi DB regional pengirim (ID: ${pengirimData.regionId}) tidak ditemukan.`);
        // Ini adalah masalah serius, butuh intervensi manual atau alerting system
        throw new Error(`Konfigurasi DB regional pengirim (ID: ${pengirimData.regionId}) tidak ditemukan saat kompensasi.`);
    }
    const { UserRegional, TransactionRegional } = regionalModelsPengirim;
    const regionalDbPengirim = db.getRegionalSequelize(pengirimData.regionId);

    const tKompensasi = await regionalDbPengirim.transaction();
    try {
        const userPengirim = await UserRegional.findOne({
            where: { user_id_master: pengirimData.userId },
            transaction: tKompensasi,
            lock: tKompensasi.LOCK.UPDATE,
        });

        if (!userPengirim) {
            await tKompensasi.rollback();
            console.error(`[KOMPENSASI GAGAL] User pengirim (ID: ${pengirimData.userId}) tidak ditemukan di region ${pengirimData.regionId}.`);
            throw new Error('User pengirim tidak ditemukan saat kompensasi.');
        }

        const saldoSebelumKompensasi = parseFloat(userPengirim.saldo);
        const saldoSetelahKompensasi = saldoSebelumKompensasi + parseFloat(nominal);

        // Kembalikan saldo
        await userPengirim.update({ saldo: saldoSetelahKompensasi }, { transaction: tKompensasi });

        // Update status transaksi asli pengirim menjadi SAGA_FAILED_COMPENSATED
        if (logPengirimAsli && logPengirimAsli.transaction_id) {
             // Cari ulang log pengirim dalam transaksi kompensasi untuk update
            const logToUpdate = await TransactionRegional.findByPk(logPengirimAsli.transaction_id, {
                transaction: tKompensasi,
                lock: tKompensasi.LOCK.UPDATE
            });
            if (logToUpdate) {
                await logToUpdate.update({
                    status: 'SAGA_FAILED_COMPENSATED',
                    keterangan: `${logToUpdate.keterangan} (Kompensasi: ${keteranganKompensasi})`
                }, { transaction: tKompensasi });
            } else {
                console.warn(`Log transaksi pengirim asli (ID: ${logPengirimAsli.transaction_id}) tidak ditemukan saat update status kompensasi.`);
            }
        } else {
            console.warn("Objek logPengirimAsli atau transaction_id tidak tersedia untuk update status kompensasi.");
        }


        await tKompensasi.commit();
        console.log(`Kompensasi berhasil untuk user_id: ${pengirimData.userId}. Saldo dikembalikan.`);

        // Sinkronisasi log kompensasi ke GlobalTransactionLog
        const { GlobalTransactionLog } = db.master;
        try {
            await GlobalTransactionLog.create({
                transaction_id_regional: logPengirimAsli ? logPengirimAsli.transaction_id : null, // Referensi ke log regional yang dikompensasi
                tipe_transaksi: 'SAGA_COMPENSATION',
                user_id_pengirim: pengirimData.userId,
                nominal: nominal, // Nominal yang dikompensasi (dikembalikan)
                region_sumber_id: pengirimData.regionId,
                status: 'COMPLETED', // Kompensasi berhasil
                keterangan: `Kompensasi untuk transfer gagal. ${keteranganKompensasi}. User: ${pengirimData.userId}, Region: ${pengirimData.regionId}.`
            });
        } catch (syncError) {
            console.error("Gagal sinkronisasi log kompensasi ke GlobalTransactionLog:", syncError);
        }

    } catch (error) {
        await tKompensasi.rollback();
        console.error(`[KOMPENSASI KRITIS GAGAL] Error saat kompensasi debit untuk user ID ${pengirimData.userId}:`, error);
        // Ini adalah skenario terburuk, data bisa jadi tidak konsisten.
        // Butuh alerting dan intervensi manual.
        throw new Error('Proses kompensasi gagal kritis.');
    }
}

/**
 * Mengorkestrasi transfer saldo antar region menggunakan SAGA pattern.
 * @param {object} pengirim - Data pengirim { userId, regionId, username }
 * @param {object} penerima - Data penerima { userId, regionId, username }
 * @param {number} nominal - Nominal transfer
 */
export const transferInterRegionSaga = async (pengirim, penerima, nominalTransfer) => {
    const nominal = parseFloat(nominalTransfer);
    if (isNaN(nominal) || nominal <= 0) {
        throw new Error("Nominal transfer tidak valid.");
    }

    const regionalModelsPengirim = db.getRegionalModels(pengirim.regionId);
    const regionalModelsPenerima = db.getRegionalModels(penerima.regionId);

    if (!regionalModelsPengirim || !regionalModelsPenerima) {
        throw new Error("Konfigurasi database regional pengirim atau penerima tidak ditemukan.");
    }

    const { UserRegional: UserRegionalPengirim, TransactionRegional: TransactionRegionalPengirim } = regionalModelsPengirim;
    const { UserRegional: UserRegionalPenerima, TransactionRegional: TransactionRegionalPenerima } = regionalModelsPenerima;

    const regionalDbPengirim = db.getRegionalSequelize(pengirim.regionId);
    const regionalDbPenerima = db.getRegionalSequelize(penerima.regionId);

    let logTransaksiPengirimAsli; // Untuk menyimpan record transaksi pengirim

    // Langkah 1: Debit Saldo Pengirim (Transaksi Lokal 1)
    const tPengirim = await regionalDbPengirim.transaction();
    try {
        const userPengirim = await UserRegionalPengirim.findOne({
            where: { user_id_master: pengirim.userId },
            transaction: tPengirim,
            lock: tPengirim.LOCK.UPDATE,
        });

        if (!userPengirim) {
            await tPengirim.rollback();
            throw new Error(`Pengguna pengirim (ID: ${pengirim.userId}) tidak ditemukan di regionnya.`);
        }

        const saldoSebelumPengirim = parseFloat(userPengirim.saldo);
        if (saldoSebelumPengirim < nominal) {
            await tPengirim.rollback();
            throw new Error("Saldo pengirim tidak mencukupi.");
        }

        const saldoSesudahPengirim = saldoSebelumPengirim - nominal;
        await userPengirim.update({ saldo: saldoSesudahPengirim }, { transaction: tPengirim });

        logTransaksiPengirimAsli = await TransactionRegionalPengirim.create({
            tipe_transaksi: 'TRANSFER_KELUAR',
            user_id_regional: pengirim.userId,
            user_id_terkait: penerima.userId,
            region_id_user_terkait: penerima.regionId,
            nominal: nominal,
            saldo_sebelum: saldoSebelumPengirim,
            saldo_sesudah: saldoSesudahPengirim,
            status: 'SAGA_PENDING_CREDIT', // Status awal untuk SAGA
            keterangan: `Transfer ke ${penerima.username} (Region: ${penerima.regionId}) - Menunggu kredit penerima`
        }, { transaction: tPengirim });

        await tPengirim.commit();
        console.log(`Langkah 1 SAGA (Debit Pengirim) berhasil untuk user ID ${pengirim.userId}.`);
    } catch (error) {
        if (tPengirim && !tPengirim.finished) await tPengirim.rollback();
        console.error(`Error pada Langkah 1 SAGA (Debit Pengirim) untuk user ID ${pengirim.userId}:`, error);
        throw new Error(`Gagal melakukan debit pada pengirim: ${error.message}`);
    }

    // Langkah 2: Credit Saldo Penerima (Transaksi Lokal 2)
    const tPenerima = await regionalDbPenerima.transaction();
    let kreditPenerimaBerhasil = false;
    try {
        const userPenerima = await UserRegionalPenerima.findOne({
            where: { user_id_master: penerima.userId },
            transaction: tPenerima,
            lock: tPenerima.LOCK.UPDATE,
        });

        if (!userPenerima) {
            await tPenerima.rollback();
            // Jika penerima tidak ada di regionalnya, ini masalah data. Kompensasi pengirim.
            throw new Error(`Pengguna penerima (ID: ${penerima.userId}) tidak ditemukan di regionnya.`);
        }

        const saldoSebelumPenerima = parseFloat(userPenerima.saldo);
        const saldoSesudahPenerima = saldoSebelumPenerima + nominal;
        await userPenerima.update({ saldo: saldoSesudahPenerima }, { transaction: tPenerima });

        await TransactionRegionalPenerima.create({
            tipe_transaksi: 'TRANSFER_MASUK',
            user_id_regional: penerima.userId,
            user_id_terkait: pengirim.userId,
            region_id_user_terkait: pengirim.regionId,
            nominal: nominal,
            saldo_sebelum: saldoSebelumPenerima,
            saldo_sesudah: saldoSesudahPenerima,
            status: 'COMPLETED',
            keterangan: `Transfer diterima dari ${pengirim.username} (Region: ${pengirim.regionId})`
        }, { transaction: tPenerima });

        await tPenerima.commit();
        kreditPenerimaBerhasil = true;
        console.log(`Langkah 2 SAGA (Kredit Penerima) berhasil untuk user ID ${penerima.userId}.`);
    } catch (error) {
        if (tPenerima && !tPenerima.finished) await tPenerima.rollback();
        console.error(`Error pada Langkah 2 SAGA (Kredit Penerima) untuk user ID ${penerima.userId}:`, error);
        // Jika Langkah 2 gagal, panggil kompensasi untuk Langkah 1
        console.log(`Memulai kompensasi untuk debit pengirim karena kredit penerima gagal.`);
        try {
            await compensateDebitPengirim(pengirim, nominal, logTransaksiPengirimAsli, `Kredit ke penerima ${penerima.username} gagal: ${error.message}`);
        } catch (compError) {
            // Jika kompensasi juga gagal, ini adalah error kritis.
            // Log error ini secara detail untuk investigasi manual.
            console.error("KEGAGALAN KRITIS PADA KOMPENSASI SAGA:", compError);
        }
        throw new Error(`Gagal melakukan kredit pada penerima, debit pengirim telah/akan dikompensasi: ${error.message}`);
    }

    // Langkah 3: Finalisasi SAGA jika semua berhasil
    if (kreditPenerimaBerhasil) {
        // Update status transaksi pengirim menjadi COMPLETED
        const tPengirimFinalize = await regionalDbPengirim.transaction();
        try {
            const logPengirimToFinalize = await TransactionRegionalPengirim.findByPk(logTransaksiPengirimAsli.transaction_id, {
                transaction: tPengirimFinalize,
                lock: tPengirimFinalize.LOCK.UPDATE
            });
            if (logPengirimToFinalize) {
                await logPengirimToFinalize.update({
                    status: 'COMPLETED',
                    keterangan: `Transfer ke ${penerima.username} (Region: ${penerima.regionId}) berhasil`
                }, { transaction: tPengirimFinalize });
                await tPengirimFinalize.commit();
                console.log(`Status transaksi pengirim (ID: ${logTransaksiPengirimAsli.transaction_id}) diupdate menjadi COMPLETED.`);
            } else {
                await tPengirimFinalize.rollback(); // Seharusnya tidak terjadi jika logTransaksiPengirimAsli valid
                console.error(`Log transaksi pengirim (ID: ${logTransaksiPengirimAsli.transaction_id}) tidak ditemukan saat finalisasi.`);
            }
        } catch (finalizeError) {
            if(tPengirimFinalize && !tPengirimFinalize.finished) await tPengirimFinalize.rollback();
            console.error("Gagal memfinalisasi status transaksi pengirim:", finalizeError);
            // Pada titik ini, kredit penerima sudah berhasil.
            // Kegagalan update status pengirim tidak menghentikan transfernya, tapi log pengirim mungkin tidak akurat.
            // Perlu mekanisme rekonsiliasi status.
        }

        // Sinkronisasi ke GlobalTransactionLog
        const { GlobalTransactionLog } = db.master;
        try {
            await GlobalTransactionLog.create({
                // transaction_id_regional bisa merujuk ke salah satu atau keduanya, atau dibuat unik
                // Untuk simple, kita bisa kosongkan atau pakai salah satu.
                tipe_transaksi: 'TRANSFER',
                user_id_pengirim: pengirim.userId,
                user_id_penerima: penerima.userId,
                nominal: nominal,
                // waktu_transaksi_regional bisa diambil dari logTransaksiPengirimAsli.waktu_transaksi
                region_sumber_id: pengirim.regionId,
                region_tujuan_id: penerima.regionId,
                status: 'COMPLETED',
                keterangan: `Transfer Inter-Region: Dari ${pengirim.username} (Reg: ${pengirim.regionId}) ke ${penerima.username} (Reg: ${penerima.regionId})`
            });
            console.log("Transfer inter-region berhasil disinkronkan ke GlobalTransactionLog.");
        } catch (syncError) {
            console.error("Gagal sinkronisasi transfer inter-region ke GlobalTransactionLog:", syncError);
        }

        return {
            message: "Transfer antar region berhasil!",
            detail: {
                pengirim: pengirim.username,
                penerima: penerima.username,
                nominal: nominal
            }
        };
    }
    // Jika sampai sini tanpa return atau throw error, berarti ada logika yang terlewat (seharusnya tidak terjadi)
    throw new Error("Alur SAGA tidak terduga.");
};
