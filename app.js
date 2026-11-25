// =========================================================
// 1. KONFIGURASI SUPABASE (PROYEK LOYALTYPABRIK)
// =========================================================
const SUPABASE_URL = "https://zoencdqkequznfxxemea.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MAcRhFIHjcDVyV18IjXdAw_da8wLt5b";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================================================
// 2. STATE APLIKASI & PENYIMPANAN SESI LOKAL
// =========================================================
const EMP_STORAGE_KEY = "loyalty_pabrik_emp_session";
const WARUNG_STORAGE_KEY = "loyalty_pabrik_warung_session";

let currentEmployee = JSON.parse(localStorage.getItem(EMP_STORAGE_KEY) || "null");
let currentWarung = JSON.parse(localStorage.getItem(WARUNG_STORAGE_KEY) || "null");

let productCatalog = [];
let appSettings = {
    id: 1,
    rupiah_per_point: 10000,
    max_amount_per_tx: 500000,
    max_tx_per_day: 3
};
let pointRules = [];
let warungList = [];
let selectedWarungForLogin = null;
let regWarungZone = "Area Pabrik";

let scannedEmployee = null;
let selectedProduct = null;
let cartItems = [];
let pendingRedeemReward = null;
let editingProductTarget = null;
let html5QrScanner = null;
let isScanningQr = false;

const REWARD_CATALOG = [
    {
        name: "Voucher Pulsa Rp 5.000",
        category: "Voucher Pulsa",
        description: "Pulsa elektrik semua operator (paket perdana)",
        pointsCost: 3
    },
    {
        name: "Voucher Pulsa Rp 10.000",
        category: "Voucher Pulsa",
        description: "Pulsa elektrik semua operator ke nomor terdaftar",
        pointsCost: 10
    },
    {
        name: "Voucher Grab Rp 15.000",
        category: "Voucher Grab",
        description: "Saldo voucher GrabBike / GrabFood",
        pointsCost: 15
    },
    {
        name: "Tumbler Stainless Pabrik",
        category: "Merchandise",
        description: "Botol minum tahan panas/dingin 500ml",
        pointsCost: 30
    },
    {
        name: "Kaos Eksklusif Member",
        category: "Merchandise",
        description: "Kaos katun kombed edisi khusus karyawan",
        pointsCost: 50
    }
];

// =========================================================
// 3. FUNGSI BANTU (FORMAT RUPIAH, TOAST, NAVIGASI)
// =========================================================
function formatRupiah(num) {
    return new Intl.NumberFormat("id-ID").format(Number(num) || 0);
}

function showToast(message, isError = false) {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `px-4 py-3 rounded-xl text-xs font-semibold text-white shadow-lg transition-opacity duration-300 ${
        isError ? "bg-red-600" : "bg-slate-900"
    }`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add("opacity-0");
        setTimeout(() => el.remove(), 300);
    }, 3200);
}

function showView(viewId) {
    stopQrScanner();
    const views = [
        "view-emp-auth",
        "view-emp-card",
        "view-redeem",
        "view-history",
        "view-warung-login",
        "view-cashier",
        "view-pos-settings"
    ];
    views.forEach((id) => {
        document.getElementById(id).classList.toggle("hidden", id !== viewId);
    });
}

function saveEmployeeSession(emp) {
    currentEmployee = emp;
    if (emp) {
        localStorage.setItem(EMP_STORAGE_KEY, JSON.stringify(emp));
    } else {
        localStorage.removeItem(EMP_STORAGE_KEY);
    }
}

function saveWarungSession(warung) {
    currentWarung = warung;
    if (warung) {
        localStorage.setItem(WARUNG_STORAGE_KEY, JSON.stringify(warung));
    } else {
        localStorage.removeItem(WARUNG_STORAGE_KEY);
    }
}

// =========================================================
// 4. MODUL KARYAWAN (LOGIN, REGISTRASI & KARTU QR)
// =========================================================
function renderEmployeeCard() {
    if (!currentEmployee) {
        showView("view-emp-auth");
        return;
    }
    showView("view-emp-card");
    document.getElementById("card-emp-name").textContent = currentEmployee.full_name;
    document.getElementById("card-emp-phone").textContent = `No. HP: ${currentEmployee.phone_number}`;
    document.getElementById("card-emp-points").textContent = currentEmployee.points;
    document.getElementById("card-emp-id").textContent = `ID: ${currentEmployee.id}`;

    const qrContainer = document.getElementById("qrcode-container");
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: currentEmployee.id,
        width: 170,
        height: 170,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });
}

async function handleEmployeeLogin() {
    const phone = document.getElementById("login-emp-phone").value.trim();
    if (!phone) {
        showToast("Masukkan nomor HP yang terdaftar!", true);
        return;
    }
    const { data, error } = await db
        .from("employees")
        .select("*")
        .eq("phone_number", phone)
        .maybeSingle();

    if (error) {
        showToast(`Gagal masuk: ${error.message}`, true);
        return;
    }
    if (!data) {
        showToast("Nomor HP belum terdaftar. Silakan pilih tab Daftar Karyawan Baru.", true);
        return;
    }
    saveEmployeeSession(data);
    showToast(`Selamat datang kembali, ${data.full_name}!`);
    renderEmployeeCard();
}

async function handleEmployeeRegister() {
    const fullName = document.getElementById("reg-emp-name").value.trim();
    const phone = document.getElementById("reg-emp-phone").value.trim();
    if (!fullName || !phone) {
        showToast("Nama lengkap dan Nomor HP wajib diisi!", true);
        return;
    }

    const { data: existing } = await db
        .from("employees")
        .select("*")
        .eq("phone_number", phone)
        .maybeSingle();

    if (existing) {
        saveEmployeeSession(existing);
        showToast("Nomor HP sudah terdaftar, otomatis masuk ke akun Anda.");
        renderEmployeeCard();
        return;
    }

    const { data, error } = await db
        .from("employees")
        .insert([{ full_name: fullName, phone_number: phone, points: 0 }])
        .select()
        .single();

    if (error) {
        showToast(`Gagal mendaftar: ${error.message}`, true);
        return;
    }
    saveEmployeeSession(data);
    showToast("Pendaftaran berhasil! Kartu QR Anda siap.");
    renderEmployeeCard();
}

async function refreshEmployeePoints() {
    if (!currentEmployee?.id) return;
    const { data, error } = await db
        .from("employees")
        .select("*")
        .eq("id", currentEmployee.id)
        .maybeSingle();

    if (error) {
        showToast(`Gagal refresh saldo: ${error.message}`, true);
        return;
    }
    if (data) {
        saveEmployeeSession(data);
        renderEmployeeCard();
        showToast(`Saldo poin diperbarui: ${data.points} Poin`);
    }
}

// =========================================================
// 5. MODUL KATALOG TUKAR POIN (REDEEM)
// =========================================================
async function openRedeemScreen() {
    if (!currentEmployee) return;
    showView("view-redeem");
    document.getElementById("redeem-emp-name").textContent = currentEmployee.full_name;
    document.getElementById("redeem-emp-points").textContent = currentEmployee.points;

    renderRewardCatalog();
    await loadRedemptionHistory();
}

function renderRewardCatalog() {
    const listEl = document.getElementById("reward-catalog-list");
    listEl.innerHTML = "";

    REWARD_CATALOG.forEach((item) => {
        const isEnough = currentEmployee.points >= item.pointsCost;
        const kekurangan = item.pointsCost - currentEmployee.points;

        const card = document.createElement("div");
        card.className = "border border-slate-200 rounded-2xl p-4 bg-white shadow-sm space-y-2";
        card.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">${item.category}</span>
                <span class="font-bold text-sm text-blue-700">${item.pointsCost} Poin</span>
            </div>
            <div>
                <h3 class="font-bold text-sm text-slate-900">${item.name}</h3>
                <p class="text-xs text-slate-500">${item.description}</p>
            </div>
            <button ${isEnough ? "" : "disabled"}
                class="w-full py-2.5 rounded-full text-xs font-bold ${
                    isEnough
                        ? "bg-blue-800 hover:bg-blue-900 text-white"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }">
                ${isEnough ? `TUKAR SEKARANG (${item.pointsCost} POIN)` : `KURANG ${kekurangan} POIN`}
            </button>
        `;
        if (isEnough) {
            card.querySelector("button").addEventListener("click", () => {
                pendingRedeemReward = item;
                document.getElementById("modal-redeem-text").textContent =
                    `Tukarkan ${item.pointsCost} Poin Anda dengan ${item.name}? Sisa poin setelah penukaran: ${
                        currentEmployee.points - item.pointsCost
                    } Poin.`;
                document.getElementById("modal-redeem-confirm").classList.remove("hidden");
            });
        }
        listEl.appendChild(card);
    });
}

async function executeRedeem() {
    if (!pendingRedeemReward || !currentEmployee) return;
    const reward = pendingRedeemReward;
    document.getElementById("modal-redeem-confirm").classList.add("hidden");

    const { data: latestEmp, error: fetchErr } = await db
        .from("employees")
        .select("*")
        .eq("id", currentEmployee.id)
        .single();

    if (fetchErr || !latestEmp) {
        showToast("Gagal memeriksa saldo terkini.", true);
        return;
    }
    if (latestEmp.points < reward.pointsCost) {
        saveEmployeeSession(latestEmp);
        openRedeemScreen();
        showToast(`Saldo poin tidak mencukupi (Saldo: ${latestEmp.points} Poin).`, true);
        return;
    }

    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const voucherCode = `LP-${randomNum}`;

    const { error: insertErr } = await db.from("redemptions").insert([
        {
            employee_id: latestEmp.id,
            reward_name: reward.name,
            reward_category: reward.category,
            points_spent: reward.pointsCost,
            voucher_code: voucherCode,
            status: "Berhasil Diklaim"
        }
    ]);

    if (insertErr) {
        showToast(`Gagal menukar poin: ${insertErr.message}`, true);
        return;
    }

    const remainingPoints = latestEmp.points - reward.pointsCost;
    const { error: updateErr } = await db
        .from("employees")
        .update({ points: remainingPoints })
        .eq("id", latestEmp.id);

    if (updateErr) {
        showToast(`Poin gagal dipotong: ${updateErr.message}`, true);
        return;
    }

    saveEmployeeSession({ ...latestEmp, points: remainingPoints });
    pendingRedeemReward = null;
    showToast(`Berhasil ditukar! Kode klaim: ${voucherCode}`);
    openRedeemScreen();
}

async function loadRedemptionHistory() {
    const historyEl = document.getElementById("redemption-history-list");
    historyEl.innerHTML = `<p class="text-xs text-slate-400">Memuat riwayat klaim...</p>`;

    const { data, error } = await db
        .from("redemptions")
        .select("*")
        .eq("employee_id", currentEmployee.id)
        .order("created_at", { ascending: false });

    if (error) {
        historyEl.innerHTML = `<p class="text-xs text-red-600">Gagal memuat riwayat: ${error.message}</p>`;
        return;
    }
    if (!data || data.length === 0) {
        historyEl.innerHTML = `<p class="text-xs text-slate-500">Belum ada riwayat penukaran hadiah.</p>`;
        return;
    }

    historyEl.innerHTML = "";
    data.forEach((row) => {
        const card = document.createElement("div");
        card.className = "border border-slate-200 rounded-xl p-3.5 text-xs space-y-1";
        card.innerHTML = `
            <div class="flex justify-between font-bold">
                <span class="text-slate-900">${row.reward_name}</span>
                <span class="text-red-600">-${row.points_spent} Poin</span>
            </div>
            <p class="font-semibold text-blue-700">Kode Klaim: ${row.voucher_code}</p>
            <p class="text-slate-500">Status: ${row.status}</p>
        `;
        historyEl.appendChild(card);
    });
}

// =========================================================
// 6. MODUL RIWAYAT BELANJA & REKAP WARUNG / ZONA
// =========================================================
async function openHistoryScreen() {
    if (!currentEmployee) return;
    showView("view-history");
    document.getElementById("hist-summary-name").textContent = currentEmployee.full_name;

    const { data: allTx, error } = await db
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        showToast(`Gagal memuat transaksi: ${error.message}`, true);
        return;
    }
    const transactions = allTx || [];

    const myTx = transactions.filter((t) => t.employee_id === currentEmployee.id);
    const totalBelanjaSaya = myTx.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalPoinSaya = myTx.reduce((sum, t) => sum + (t.points_earned || 0), 0);

    document.getElementById("hist-summary-count").textContent = `${myTx.length}x Jajan`;
    document.getElementById("hist-summary-amount").textContent = `Rp ${formatRupiah(totalBelanjaSaya)}`;
    document.getElementById("hist-summary-points").textContent = `+${totalPoinSaya} Poin`;

    const myListEl = document.getElementById("my-transactions-list");
    myListEl.innerHTML = "";
    if (myTx.length === 0) {
        myListEl.innerHTML = `<p class="text-xs text-slate-500">Belum ada riwayat transaksi belanja di warung mitra.</p>`;
    } else {
        myTx.forEach((tx) => {
            const waktu = tx.created_at ? tx.created_at.slice(0, 16).replace("T", " ") : "-";
            const card = document.createElement("div");
            card.className = "border border-slate-200 rounded-xl p-3.5 space-y-1.5 shadow-sm";
            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm text-slate-900">${tx.warung_name}</span>
                    <span class="text-[11px] font-semibold bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">${tx.warung_zone}</span>
                </div>
                <div class="flex justify-between text-xs">
                    <span>Belanja: Rp ${formatRupiah(tx.amount)}</span>
                    <span class="font-bold text-blue-700">+${tx.points_earned} Poin</span>
                </div>
                ${tx.items_summary ? `<p class="text-[11px] text-slate-600">Item: ${tx.items_summary}</p>` : ""}
                <p class="text-[10px] text-slate-400">Waktu: ${waktu} UTC</p>
            `;
            myListEl.appendChild(card);
        });
    }

    const pabrikTx = transactions.filter((t) => (t.warung_zone || "").toLowerCase() === "area pabrik");
    const kostTx = transactions.filter((t) => (t.warung_zone || "").toLowerCase() === "area kost");

    const pabrikOmzet = pabrikTx.reduce((s, t) => s + (t.amount || 0), 0);
    const kostOmzet = kostTx.reduce((s, t) => s + (t.amount || 0), 0);
    const pabrikPoin = pabrikTx.reduce((s, t) => s + (t.points_earned || 0), 0);
    const kostPoin = kostTx.reduce((s, t) => s + (t.points_earned || 0), 0);

    document.getElementById("recap-pabrik-omzet").textContent = `Rp ${formatRupiah(pabrikOmzet)}`;
    document.getElementById("recap-pabrik-detail").textContent = `${pabrikTx.length} transaksi • ${pabrikPoin} poin`;

    document.getElementById("recap-kost-omzet").textContent = `Rp ${formatRupiah(kostOmzet)}`;
    document.getElementById("recap-kost-detail").textContent = `${kostTx.length} transaksi • ${kostPoin} poin`;

    const totalOmzet = pabrikOmzet + kostOmzet;
    const persenPabrik = totalOmzet > 0 ? Math.round((pabrikOmzet / totalOmzet) * 100) : 50;
    const persenKost = totalOmzet > 0 ? 100 - persenPabrik : 50;

    document.getElementById("recap-pabrik-pct").textContent = `${persenPabrik}%`;
    document.getElementById("recap-kost-pct").textContent = `${persenKost}%`;
    document.getElementById("recap-progress-bar").style.width = `${persenPabrik}%`;

    const grouped = {};
    transactions.forEach((tx) => {
        const key = `${(tx.warung_name || "").trim()}|${(tx.warung_zone || "").trim()}`;
        if (!grouped[key]) {
            grouped[key] = {
                warungName: tx.warung_name,
                warungZone: tx.warung_zone,
                count: 0,
                amount: 0,
                points: 0
            };
        }
        grouped[key].count += 1;
        grouped[key].amount += tx.amount || 0;
        grouped[key].points += tx.points_earned || 0;
    });

    const sortedWarungs = Object.values(grouped).sort((a, b) => b.amount - a.amount);
    const warungRecapEl = document.getElementById("warung-recap-list");
    warungRecapEl.innerHTML = "";

    if (sortedWarungs.length === 0) {
        warungRecapEl.innerHTML = `<p class="text-xs text-slate-500">Belum ada data transaksi warung.</p>`;
    } else {
        sortedWarungs.forEach((w, idx) => {
            const card = document.createElement("div");
            card.className = "border border-slate-200 rounded-xl p-3.5 space-y-1 shadow-sm";
            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm text-slate-900">#${idx + 1} ${w.warungName}</span>
                    <span class="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">${w.warungZone}</span>
                </div>
                <div class="flex justify-between text-xs">
                    <span class="font-semibold text-blue-700">Omzet: Rp ${formatRupiah(w.amount)}</span>
                    <span class="text-slate-500">${w.count}x • ${w.points} Poin</span>
                </div>
            `;
            warungRecapEl.appendChild(card);
        });
    }
}

// =========================================================
// 7. MODUL LOGIN & REGISTRASI MITRA WARUNG
// =========================================================
async function openCashierEntry() {
    if (currentWarung) {
        await openCashierScreen();
    } else {
        await openWarungLoginScreen();
    }
}

async function openWarungLoginScreen() {
    showView("view-warung-login");
    const listEl = document.getElementById("warung-select-list");
    listEl.innerHTML = `<p class="text-xs text-slate-400">Memuat daftar warung...</p>`;

    const { data, error } = await db
        .from("warungs")
        .select("*")
        .order("warung_name", { ascending: true });

    if (error) {
        listEl.innerHTML = `<p class="text-xs text-red-600">Gagal memuat warung: ${error.message}</p>`;
        return;
    }
    warungList = data || [];
    if (!selectedWarungForLogin && warungList.length > 0) {
        selectedWarungForLogin = warungList[0];
    }
    renderWarungSelectList();
}

function renderWarungSelectList() {
    const listEl = document.getElementById("warung-select-list");
    listEl.innerHTML = "";

    if (warungList.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-500">Belum ada warung terdaftar. Pilih tab Daftar Warung Baru.</p>`;
        return;
    }

    warungList.forEach((w) => {
        const isSelected = selectedWarungForLogin?.warung_name === w.warung_name;
        const card = document.createElement("div");
        card.className = `p-3 rounded-xl cursor-pointer flex justify-between items-center ${
            isSelected ? "border-2 border-blue-700 bg-blue-50/50" : "border border-slate-200 bg-white"
        }`;
        card.innerHTML = `
            <div>
                <p class="font-bold text-sm text-slate-900">${w.warung_name}</p>
                ${w.owner_name ? `<p class="text-xs text-slate-500">Pemilik: ${w.owner_name}</p>` : ""}
            </div>
            <span class="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">${w.warung_zone}</span>
        `;
        card.addEventListener("click", () => {
            selectedWarungForLogin = w;
            document.getElementById("login-warung-pin").value = "";
            renderWarungSelectList();
        });
        listEl.appendChild(card);
    });
}

function handleWarungLogin() {
    const pin = document.getElementById("login-warung-pin").value.trim();
    if (!selectedWarungForLogin) {
        showToast("Pilih warung terlebih dahulu!", true);
        return;
    }
    if (!pin) {
        showToast("Masukkan PIN kasir!", true);
        return;
    }
    if (pin === selectedWarungForLogin.pin_code) {
        saveWarungSession(selectedWarungForLogin);
        document.getElementById("login-warung-pin").value = "";
        showToast(`Login berhasil: ${selectedWarungForLogin.warung_name}`);
        openCashierScreen();
    } else {
        showToast("PIN salah! Silakan coba lagi.", true);
    }
}

async function handleWarungRegister() {
    const warungName = document.getElementById("reg-warung-name").value.trim();
    const ownerName = document.getElementById("reg-warung-owner").value.trim();
    const pinCode = document.getElementById("reg-warung-pin").value.trim();

    if (!warungName || pinCode.length < 4) {
        showToast("Nama warung wajib diisi dan PIN minimal 4 digit!", true);
        return;
    }

    const { data, error } = await db
        .from("warungs")
        .insert([
            {
                warung_name: warungName,
                owner_name: ownerName,
                warung_zone: regWarungZone,
                pin_code: pinCode
            }
        ])
        .select()
        .single();

    if (error) {
        showToast(`Gagal mendaftarkan warung: ${error.message}`, true);
        return;
    }
    saveWarungSession(data);
    showToast("Warung berhasil terdaftar & otomatis masuk!");
    openCashierScreen();
}

// =========================================================
// 8. MODUL MODE KASIR WARUNG (SCAN QR + KATALOG POS)
// =========================================================
async function openCashierScreen() {
    if (!currentWarung) {
        openWarungLoginScreen();
        return;
    }
    showView("view-cashier");
    document.getElementById("cashier-warung-name").textContent = currentWarung.warung_name;
    document.getElementById("cashier-warung-zone").textContent = currentWarung.warung_zone;

    await loadCatalogAndSettings();
    renderCashierProductList();
    renderCartList();
}

async function loadCatalogAndSettings() {
    const { data: prods } = await db
        .from("products")
        .select("*")
        .order("name", { ascending: true });

    productCatalog = prods || [];
    if (!selectedProduct && productCatalog.length > 0) {
        selectedProduct = productCatalog[0];
    } else if (selectedProduct) {
        selectedProduct = productCatalog.find((p) => p.id === selectedProduct.id) || productCatalog[0] || null;
    }

    const { data: settings } = await db
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

    if (settings) {
        appSettings = settings;
    }

    const rate = appSettings.rupiah_per_point || 10000;
    document.getElementById("cashier-rule-info").textContent =
        `Ketentuan aktif: Kelipatan Rp ${formatRupiah(rate)} = 1 Poin (Maks Rp ${formatRupiah(
            appSettings.max_amount_per_tx
        )}/transaksi, maks ${appSettings.max_tx_per_day}x/hari)`;
    updateAddButtonPreview();
}

function startQrScanner() {
    const wrapper = document.getElementById("qr-reader-wrapper");
    wrapper.classList.remove("hidden");

    if (isScanningQr) return;
    html5QrScanner = new Html5Qrcode("qr-reader");
    isScanningQr = true;

    html5QrScanner
        .start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
                stopQrScanner();
                document.getElementById("cashier-emp-query").value = decodedText;
                lookupEmployeeInCashier(decodedText);
            },
            () => {}
        )
        .catch((err) => {
            isScanningQr = false;
            wrapper.classList.add("hidden");
            showToast(`Kamera tidak dapat diakses (${err}). Gunakan input manual No. HP / ID QR.`, true);
        });
}

function stopQrScanner() {
    const wrapper = document.getElementById("qr-reader-wrapper");
    if (wrapper) wrapper.classList.add("hidden");

    if (html5QrScanner && isScanningQr) {
        isScanningQr = false;
        html5QrScanner
            .stop()
            .then(() => html5QrScanner.clear())
            .catch(() => {});
    }
}

async function lookupEmployeeInCashier(rawQuery) {
    const query = (rawQuery || "").trim();
    if (!query) {
        showToast("Masukkan No. HP atau ID QR karyawan!", true);
        return;
    }

    const isUuid = query.length === 36 && query.includes("-");
    const req = db.from("employees").select("*");
    const { data, error } = isUuid
        ? await req.eq("id", query).maybeSingle()
        : await req.eq("phone_number", query).maybeSingle();

    if (error) {
        showToast(`Gagal mencari karyawan: ${error.message}`, true);
        return;
    }
    if (!data) {
        scannedEmployee = null;
        document.getElementById("cashier-emp-result").classList.add("hidden");
        showToast("Data karyawan tidak ditemukan!", true);
        updateCheckoutBar();
        return;
    }

    scannedEmployee = data;
    document.getElementById("cashier-emp-name").textContent = data.full_name;
    document.getElementById("cashier-emp-phone").textContent = data.phone_number;
    document.getElementById("cashier-emp-points").textContent = data.points;
    document.getElementById("cashier-emp-result").classList.remove("hidden");
    showToast(`Karyawan ditemukan: ${data.full_name}`);
    updateCheckoutBar();
}

function renderCashierProductList() {
    const filterText = document.getElementById("cashier-product-search").value.trim().toLowerCase();
    const filtered = filterText
        ? productCatalog.filter((p) => p.name.toLowerCase().includes(filterText))
        : productCatalog;

    const listEl = document.getElementById("cashier-product-list");
    listEl.innerHTML = "";

    if (filtered.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-500">Barang tidak ditemukan. Tambahkan lewat tombol ATUR DAFTAR BARANG & NILAI POIN.</p>`;
        return;
    }

    filtered.forEach((prod) => {
        const isSelected = selectedProduct?.name === prod.name;
        const row = document.createElement("div");
        row.className = `px-3 py-2.5 rounded-xl cursor-pointer flex justify-between items-center text-xs ${
            isSelected ? "border-2 border-blue-700 bg-white font-bold" : "border border-slate-200 bg-white"
        }`;
        row.innerHTML = `
            <span class="text-slate-900">${prod.name}</span>
            <span class="font-semibold text-blue-700">Rp ${formatRupiah(prod.price)}</span>
        `;
        row.addEventListener("click", () => {
            selectedProduct = prod;
            renderCashierProductList();
            updateAddButtonPreview();
        });
        listEl.appendChild(row);
    });
}

function updateAddButtonPreview() {
    const qty = parseInt(document.getElementById("cashier-qty-input").value, 10) || 0;
    const subtotal = (selectedProduct?.price || 0) * qty;
    document.getElementById("btn-add-to-cart").textContent = `+ TAMBAH (Rp ${formatRupiah(subtotal)})`;
}

function addSelectedProductToCart() {
    const qty = parseInt(document.getElementById("cashier-qty-input").value, 10) || 0;
    if (!selectedProduct) {
        showToast("Pilih barang terlebih dahulu!", true);
        return;
    }
    if (qty <= 0) {
        showToast("Jumlah minimal 1!", true);
        return;
    }

    const idx = cartItems.findIndex((item) => item.product.name === selectedProduct.name);
    if (idx >= 0) {
        cartItems[idx].quantity += qty;
    } else {
        cartItems.push({ product: selectedProduct, quantity: qty });
    }

    document.getElementById("cashier-qty-input").value = "1";
    document.getElementById("cashier-product-search").value = "";
    renderCashierProductList();
    updateAddButtonPreview();
    renderCartList();
}

function renderCartList() {
    const section = document.getElementById("cashier-cart-section");
    const listEl = document.getElementById("cashier-cart-list");
    document.getElementById("cashier-cart-count").textContent = cartItems.length;

    if (cartItems.length === 0) {
        section.classList.add("hidden");
        updateCheckoutBar();
        return;
    }

    section.classList.remove("hidden");
    listEl.innerHTML = "";

    cartItems.forEach((item, index) => {
        const subtotal = item.product.price * item.quantity;
        const row = document.createElement("div");
        row.className = "flex justify-between items-center bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs";
        row.innerHTML = `
            <div>
                <p class="font-semibold text-slate-900">${item.product.name} (${item.quantity} × Rp ${formatRupiah(item.product.price)})</p>
                <p class="text-[11px] text-blue-700 font-semibold">Subtotal: Rp ${formatRupiah(subtotal)}</p>
            </div>
            <button class="text-red-600 font-bold text-[11px] px-2 py-1">Hapus</button>
        `;
        row.querySelector("button").addEventListener("click", () => {
            cartItems.splice(index, 1);
            renderCartList();
        });
        listEl.appendChild(row);
    });

    updateCheckoutBar();
}

function updateCheckoutBar() {
    const nominalBelanja = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const rate = appSettings.rupiah_per_point || 10000;
    const estimasiPoin = Math.floor(nominalBelanja / rate);

    document.getElementById("cashier-total-amount").textContent = `Rp ${formatRupiah(nominalBelanja)}`;
    document.getElementById("cashier-total-points").textContent = estimasiPoin;

    const btn = document.getElementById("btn-process-tx");
    btn.disabled = !scannedEmployee || estimasiPoin <= 0;
}

async function processCashierTransaction() {
    if (!scannedEmployee || !currentWarung) return;

    const nominalBelanja = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const rate = appSettings.rupiah_per_point || 10000;
    const estimasiPoin = Math.floor(nominalBelanja / rate);

    if (nominalBelanja < rate) {
        showToast(`Minimal belanja Rp ${formatRupiah(rate)} untuk mendapat 1 poin!`, true);
        return;
    }
    if (nominalBelanja > appSettings.max_amount_per_tx) {
        showToast(`Melebihi batas maksimal Rp ${formatRupiah(appSettings.max_amount_per_tx)} per transaksi!`, true);
        return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: empTxs } = await db
        .from("transactions")
        .select("created_at")
        .eq("employee_id", scannedEmployee.id);

    const todayCount = (empTxs || []).filter((t) => (t.created_at || "").startsWith(todayStr)).length;
    if (todayCount >= appSettings.max_tx_per_day) {
        showToast(`Batas anti-fraud tercapai: Karyawan sudah transaksi ${appSettings.max_tx_per_day}x hari ini!`, true);
        return;
    }

    const itemsSummary = cartItems.map((i) => `${i.quantity}x ${i.product.name}`).join(", ");

    const { error: txErr } = await db.from("transactions").insert([
        {
            employee_id: scannedEmployee.id,
            warung_name: currentWarung.warung_name,
            warung_zone: currentWarung.warung_zone,
            amount: nominalBelanja,
            points_earned: estimasiPoin,
            items_summary: itemsSummary
        }
    ]);

    if (txErr) {
        showToast(`Gagal menyimpan transaksi: ${txErr.message}`, true);
        return;
    }

    const newPoints = (scannedEmployee.points || 0) + estimasiPoin;
    const { error: empErr } = await db
        .from("employees")
        .update({ points: newPoints })
        .eq("id", scannedEmployee.id);

    if (empErr) {
        showToast(`Gagal memperbarui poin karyawan: ${empErr.message}`, true);
        return;
    }

    scannedEmployee.points = newPoints;
    document.getElementById("cashier-emp-points").textContent = newPoints;
    if (currentEmployee && currentEmployee.id === scannedEmployee.id) {
        saveEmployeeSession({ ...currentEmployee, points: newPoints });
    }

    cartItems = [];
    renderCartList();
    showToast(`Transaksi sukses di ${currentWarung.warung_name}! +${estimasiPoin} Poin ditambahkan.`);
}

// =========================================================
// 9. MODUL PENGATURAN KATALOG BARANG & DAFTAR NILAI POIN
// =========================================================
async function openPosSettingsScreen() {
    showView("view-pos-settings");
    await loadCatalogAndSettings();

    const { data: rules } = await db
        .from("point_rules")
        .select("*")
        .order("rupiah_amount", { ascending: true });

    pointRules = rules || [];
    renderPosSettingsProducts();
    renderPosPointRules();
}

function renderPosSettingsProducts() {
    const query = document.getElementById("pos-prod-search").value.trim().toLowerCase();
    const filtered = query
        ? productCatalog.filter((p) => p.name.toLowerCase().includes(query))
        : productCatalog;

    document.getElementById("tab-pos-products").textContent = `Daftar Barang (${productCatalog.length})`;
    const listEl = document.getElementById("pos-product-list");
    listEl.innerHTML = "";

    filtered.forEach((prod) => {
        const card = document.createElement("div");
        card.className = "border border-slate-200 rounded-xl p-3 flex justify-between items-center text-xs";
        card.innerHTML = `
            <div>
                <p class="font-bold text-slate-900">${prod.name}</p>
                <p class="font-semibold text-blue-700">Rp ${formatRupiah(prod.price)} / satuan</p>
            </div>
            <div class="space-x-2">
                <button class="btn-edit text-blue-700 font-bold">Ubah</button>
                <button class="btn-del text-red-600 font-bold">Hapus</button>
            </div>
        `;
        card.querySelector(".btn-edit").addEventListener("click", () => {
            editingProductTarget = prod;
            document.getElementById("modal-edit-prod-title").textContent = `Ubah Harga: ${prod.name}`;
            document.getElementById("modal-edit-prod-price").value = prod.price;
            document.getElementById("modal-edit-price").classList.remove("hidden");
        });
        card.querySelector(".btn-del").addEventListener("click", async () => {
            const { error } = await db.from("products").delete().eq("id", prod.id);
            if (error) {
                showToast(`Gagal hapus: ${error.message}`, true);
                return;
            }
            productCatalog = productCatalog.filter((p) => p.id !== prod.id);
            renderPosSettingsProducts();
            showToast(`${prod.name} dihapus.`);
        });
        listEl.appendChild(card);
    });
}

async function handleAddProduct() {
    const name = document.getElementById("new-prod-name").value.trim();
    const price = parseInt(document.getElementById("new-prod-price").value, 10) || 0;

    if (!name || price <= 0) {
        showToast("Nama barang dan harga satuan wajib diisi!", true);
        return;
    }

    const { data, error } = await db
        .from("products")
        .insert([{ name, price }])
        .select()
        .single();

    if (error) {
        showToast(`Gagal menyimpan barang: ${error.message}`, true);
        return;
    }

    productCatalog = [...productCatalog, data].sort((a, b) => a.name.localeCompare(b.name));
    document.getElementById("new-prod-name").value = "";
    document.getElementById("new-prod-price").value = "";
    renderPosSettingsProducts();
    showToast("Barang ditambahkan ke katalog!");
}

async function handleSaveEditedPrice() {
    if (!editingProductTarget) return;
    const newPrice = parseInt(document.getElementById("modal-edit-prod-price").value, 10) || 0;
    if (newPrice <= 0) return;

    const { error } = await db
        .from("products")
        .update({ price: newPrice })
        .eq("id", editingProductTarget.id);

    if (error) {
        showToast(`Gagal update harga: ${error.message}`, true);
        return;
    }

    productCatalog = productCatalog.map((p) =>
        p.id === editingProductTarget.id ? { ...p, price: newPrice } : p
    );
    document.getElementById("modal-edit-price").classList.add("hidden");
    editingProductTarget = null;
    renderPosSettingsProducts();
    showToast("Harga satuan diperbarui!");
}

function renderPosPointRules() {
    document.getElementById("tab-pos-points").textContent = `Nilai Poin (${pointRules.length})`;
    const listEl = document.getElementById("pos-point-rule-list");
    listEl.innerHTML = "";

    pointRules.forEach((rule) => {
        const isActive = rule.rupiah_amount === appSettings.rupiah_per_point;
        const card = document.createElement("div");
        card.className = `rounded-xl p-3 flex justify-between items-center text-xs ${
            isActive ? "border-2 border-blue-700 bg-blue-50/40" : "border border-slate-200 bg-white"
        }`;
        card.innerHTML = `
            <div>
                <p class="font-bold text-slate-900">Rp ${formatRupiah(rule.rupiah_amount)} = 1 Poin</p>
                <p class="text-[11px] ${isActive ? "text-blue-700 font-semibold" : "text-slate-500"}">
                    ${isActive ? "Status: Aktif dipakai kasir" : "Status: Tersimpan"}
                </p>
            </div>
            <div class="space-x-2">
                ${!isActive ? `<button class="btn-use text-blue-700 font-bold">Pakai</button>` : ""}
                <button class="btn-del-rule text-red-600 font-bold">Hapus</button>
            </div>
        `;

        const btnUse = card.querySelector(".btn-use");
        if (btnUse) {
            btnUse.addEventListener("click", async () => {
                await activatePointRate(rule.rupiah_amount);
            });
        }

        card.querySelector(".btn-del-rule").addEventListener("click", async () => {
            if (pointRules.length <= 1) {
                showToast("Minimal harus tersisa 1 aturan nilai poin!", true);
                return;
            }
            const { error } = await db.from("point_rules").delete().eq("id", rule.id);
            if (error) {
                showToast(`Gagal menghapus: ${error.message}`, true);
                return;
            }
            pointRules = pointRules.filter((r) => r.id !== rule.id);
            if (isActive && pointRules.length > 0) {
                await activatePointRate(pointRules[0].rupiah_amount);
            } else {
                renderPosPointRules();
            }
            showToast(`Opsi Rp ${formatRupiah(rule.rupiah_amount)} dihapus.`);
        });

        listEl.appendChild(card);
    });
}

async function activatePointRate(rate) {
    const { error } = await db
        .from("app_settings")
        .update({ rupiah_per_point: rate })
        .eq("id", 1);

    if (error) {
        showToast(`Gagal mengaktifkan nilai poin: ${error.message}`, true);
        return;
    }
    appSettings.rupiah_per_point = rate;
    renderPosPointRules();
    showToast(`Aturan aktif: Rp ${formatRupiah(rate)} = 1 Poin`);
}

async function handleAddPointRule() {
    const newRate = parseInt(document.getElementById("new-point-rule-input").value, 10) || 0;
    if (newRate < 1000) {
        showToast("Minimal kelipatan Rp 1.000 per 1 poin!", true);
        return;
    }

    const exists = pointRules.some((r) => r.rupiah_amount === newRate);
    if (!exists) {
        const { data, error } = await db
            .from("point_rules")
            .insert([{ rupiah_amount: newRate }])
            .select()
            .single();

        if (error) {
            showToast(`Gagal menambah opsi: ${error.message}`, true);
            return;
        }
        pointRules = [...pointRules, data].sort((a, b) => a.rupiah_amount - b.rupiah_amount);
    }

    document.getElementById("new-point-rule-input").value = "";
    await activatePointRate(newRate);
}

// =========================================================
// 10. EVENT LISTENERS & ROUTING PERAN OTOMATIS
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    // Tab Login / Daftar Karyawan
    document.getElementById("tab-emp-login").addEventListener("click", () => {
        document.getElementById("section-emp-login").classList.remove("hidden");
        document.getElementById("section-emp-register").classList.add("hidden");
        document.getElementById("tab-emp-login").className = "py-3 text-blue-700 border-b-2 border-blue-700";
        document.getElementById("tab-emp-register").className = "py-3 text-slate-500";
    });
    document.getElementById("tab-emp-register").addEventListener("click", () => {
        document.getElementById("section-emp-register").classList.remove("hidden");
        document.getElementById("section-emp-login").classList.add("hidden");
        document.getElementById("tab-emp-register").className = "py-3 text-blue-700 border-b-2 border-blue-700";
        document.getElementById("tab-emp-login").className = "py-3 text-slate-500";
    });

    document.getElementById("btn-emp-login").addEventListener("click", handleEmployeeLogin);
    document.getElementById("btn-emp-register").addEventListener("click", handleEmployeeRegister);
    document.getElementById("btn-refresh-points").addEventListener("click", refreshEmployeePoints);
    document.getElementById("btn-open-redeem").addEventListener("click", openRedeemScreen);
    document.getElementById("btn-open-history").addEventListener("click", openHistoryScreen);
    document.getElementById("btn-emp-logout").addEventListener("click", () => {
        saveEmployeeSession(null);
        showView("view-emp-auth");
    });

    // Gerbang awal ke Mode Kasir Warung (sebelum masuk sebagai karyawan)
    document.getElementById("btn-open-cashier-from-auth").addEventListener("click", openCashierEntry);

    // Redeem
    document.getElementById("btn-back-from-redeem").addEventListener("click", renderEmployeeCard);
    document.getElementById("btn-cancel-redeem").addEventListener("click", () => {
        document.getElementById("modal-redeem-confirm").classList.add("hidden");
    });
    document.getElementById("btn-confirm-redeem").addEventListener("click", executeRedeem);

    // History & Recap
    document.getElementById("btn-back-from-history").addEventListener("click", renderEmployeeCard);
    document.getElementById("btn-refresh-history").addEventListener("click", openHistoryScreen);
    document.getElementById("tab-hist-personal").addEventListener("click", () => {
        document.getElementById("section-hist-personal").classList.remove("hidden");
        document.getElementById("section-hist-warung").classList.add("hidden");
        document.getElementById("tab-hist-personal").className = "py-3 text-blue-700 border-b-2 border-blue-700";
        document.getElementById("tab-hist-warung").className = "py-3 text-slate-500";
    });
    document.getElementById("tab-hist-warung").addEventListener("click", () => {
        document.getElementById("section-hist-warung").classList.remove("hidden");
        document.getElementById("section-hist-personal").classList.add("hidden");
        document.getElementById("tab-hist-warung").className = "py-3 text-blue-700 border-b-2 border-blue-700";
        document.getElementById("tab-hist-personal").className = "py-3 text-slate-500";
    });

    // Warung Login & Daftar
    document.getElementById("btn-back-from-warung-login").addEventListener("click", () => {
        showView("view-emp-auth");
    });
    document.getElementById("tab-warung-signin").addEventListener("click", () => {
        document.getElementById("section-warung-signin").classList.remove("hidden");
        document.getElementById("section-warung-signup").classList.add("hidden");
        document.getElementById("tab-warung-signin").className = "py-3 text-blue-700 border-b-2 border-blue-700";
        document.getElementById("tab-warung-signup").className = "py-3 text-slate-500";
    });
    document.getElementById("tab-warung-signup").addEventListener("click", () => {
        document.getElementById("section-warung-signup").classList.remove("hidden");
        document.getElementById("section-warung-signin").classList.add("hidden");
        document.getElementById("tab-warung-signup").className = "py-3 text-blue-700 border-b-2 border-blue-700";
        document.getElementById("tab-warung-signin").className = "py-3 text-slate-500";
    });
    document.getElementById("zone-btn-pabrik").addEventListener("click", () => {
        regWarungZone = "Area Pabrik";
        document.getElementById("zone-btn-pabrik").className =
            "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border-2 border-blue-700 bg-blue-50 text-blue-800";
        document.getElementById("zone-btn-kost").className =
            "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border border-slate-300 bg-white text-slate-600";
    });
    document.getElementById("zone-btn-kost").addEventListener("click", () => {
        regWarungZone = "Area Kost";
        document.getElementById("zone-btn-kost").className =
            "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border-2 border-blue-700 bg-blue-50 text-blue-800";
        document.getElementById("zone-btn-pabrik").className =
            "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border border-slate-300 bg-white text-slate-600";
    });
    document.getElementById("btn-warung-login").addEventListener("click", handleWarungLogin);
    document.getElementById("btn-warung-register").addEventListener("click", handleWarungRegister);

    // Kasir POS (Khusus operasional warung)
    const exitCashierToLogin = () => {
        saveWarungSession(null);
        scannedEmployee = null;
        cartItems = [];
        document.getElementById("cashier-emp-result").classList.add("hidden");
        document.getElementById("cashier-emp-query").value = "";
        openWarungLoginScreen();
    };
    document.getElementById("btn-warung-logout").addEventListener("click", exitCashierToLogin);
    document.getElementById("btn-warung-logout-header").addEventListener("click", exitCashierToLogin);

    document.getElementById("btn-open-pos-settings").addEventListener("click", openPosSettingsScreen);
    document.getElementById("btn-start-qr-scan").addEventListener("click", startQrScanner);
    document.getElementById("btn-stop-qr-scan").addEventListener("click", stopQrScanner);
    document.getElementById("btn-lookup-emp").addEventListener("click", () => {
        lookupEmployeeInCashier(document.getElementById("cashier-emp-query").value);
    });
    document.getElementById("cashier-product-search").addEventListener("input", renderCashierProductList);
    document.getElementById("cashier-qty-input").addEventListener("input", updateAddButtonPreview);
    document.getElementById("btn-add-to-cart").addEventListener("click", addSelectedProductToCart);
    document.getElementById("btn-process-tx").addEventListener("click", processCashierTransaction);

    // POS Settings
    document.getElementById("btn-back-from-pos-settings").addEventListener("click", openCashierScreen);
    document.getElementById("tab-pos-products").addEventListener("click", () => {
        document.getElementById("section-pos-products").classList.remove("hidden");
        document.getElementById("section-pos-points").classList.add("hidden");
        document.getElementById("tab-pos-products").className = "py-3 text-blue-700 border-b-2 border-blue-700";
        document.getElementById("tab-pos-points").className = "py-3 text-slate-500";
    });
    document.getElementById("tab-pos-points").addEventListener("click", () => {
        document.getElementById("section-pos-points").classList.remove("hidden");
        document.getElementById("section-pos-products").classList.add("hidden");
        document.getElementById("tab-pos-points").className = "py-3 text-blue-700 border-b-2 border-blue-700";
        document.getElementById("tab-pos-products").className = "py-3 text-slate-500";
    });
    document.getElementById("btn-add-product").addEventListener("click", handleAddProduct);
    document.getElementById("pos-prod-search").addEventListener("input", renderPosSettingsProducts);
    document.getElementById("btn-cancel-edit-price").addEventListener("click", () => {
        document.getElementById("modal-edit-price").classList.add("hidden");
    });
    document.getElementById("btn-save-edit-price").addEventListener("click", handleSaveEditedPrice);

    document.getElementById("new-point-rule-input").addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10) || 0;
        const pts = val > 0 ? Math.floor(30000 / val) : 0;
        document.getElementById("point-rule-sim-text").textContent =
            val > 0
                ? `Simulasi: Belanja Rp 30.000 → Dapat +${pts} Poin`
                : `Aturan aktif saat ini: Rp ${formatRupiah(appSettings.rupiah_per_point)} = 1 Poin`;
    });
    document.getElementById("btn-add-point-rule").addEventListener("click", handleAddPointRule);

    // Routing otomatis sesuai sesi atau parameter URL (?mode=kasir)
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get("mode");

    if (currentWarung) {
        openCashierScreen();
    } else if (modeParam === "kasir") {
        openWarungLoginScreen();
    } else if (currentEmployee) {
        renderEmployeeCard();
    } else {
        showView("view-emp-auth");
    }
});
