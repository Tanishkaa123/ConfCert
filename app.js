const CONTRACT_ADDRESS = "0x8b94D4dB48ECAec78875e9D58e132EC389Bbe5AD";
let provider;
let signer;
let contract;

// State
let bulkItems = [];

// --- Initialization ---
window.addEventListener('load', async () => {
    // No settings check needed
});

// --- Tabs ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`${tabId}-section`).classList.add('active');

    const btns = document.querySelectorAll('.tab-btn');
    if (tabId === 'issue') btns[0].classList.add('active');
    if (tabId === 'bulk') btns[1].classList.add('active');
    if (tabId === 'verify') btns[2].classList.add('active');
}

// --- Wallet Connection ---
document.getElementById('connectWalletBtn').addEventListener('click', async () => {
    if (!window.ethereum) return alert("Please install MetaMask!");

    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONFCERT_ABI, signer);

        const address = await signer.getAddress();
        const btn = document.getElementById('connectWalletBtn');
        btn.innerText = address.substring(0, 6) + "..." + address.substring(38);
        btn.classList.add('connected');

        console.log("Wallet Connected:", address);
    } catch (err) {
        console.error(err);
        alert("Connection Failed: " + err.message);
    }
});

// --- Upload to IPFS via Backend ---
async function uploadToIPFS(file) {
    try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("http://localhost:3000/upload", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error("Backend upload failed");
        }

        const data = await response.json();
        return data.cid;

    } catch (error) {
        console.error("IPFS Upload Error:", error);
        throw new Error("Failed to upload to IPFS via Backend");
    }
}

// --- Single Issuance ---
async function issueCertificate() {
    if (!contract) return alert("Connect Wallet first!");

    const name = document.getElementById("studentName").value;
    const fileInput = document.getElementById("certImage");
    const statusEl = document.getElementById("issueStatus");

    if (!name || fileInput.files.length === 0) {
        return alert("Please enter name and upload certificate file.");
    }

    try {
        statusEl.innerText = "Uploading to IPFS...";
        statusEl.className = "status-msg status-loading";

        const cid = await uploadToIPFS(fileInput.files[0]);
        console.log("IPFS CID:", cid);

        statusEl.innerText = "Confirming transaction...";

        const tx = await contract.issueCertificate(name, cid);
        statusEl.innerText = "Transaction sent! Waiting for confirmation...";

        const receipt = await tx.wait();

        // 🔑 Extract Certificate ID from event
        const issuedEvent = receipt.events.find(
            (e) => e.event === "CertificateIssued"
        );

        const certId = issuedEvent.args.id.toString();

        statusEl.innerHTML = `
            ✅ <strong>Certificate Issued Successfully!</strong><br><br>
            <strong>Certificate ID:</strong>
            <span style="font-size:1.1rem; font-weight:700;">${certId}</span>
            <button
                onclick="navigator.clipboard.writeText('${certId}')"
                style="
                    margin-left:10px;
                    padding:4px 10px;
                    border-radius:6px;
                    border:none;
                    cursor:pointer;
                ">
                Copy
            </button>
            <div style="margin-top:8px; font-size:0.9rem; opacity:0.8;">
                Paste this ID in the Verify tab
            </div>
        `;
        statusEl.className = "status-msg status-success";

        // Reset form
        document.getElementById("studentName").value = "";
        fileInput.value = "";
        document.getElementById("fileName").innerText = "No file chosen";

    } catch (err) {
        console.error(err);
        statusEl.innerText = "Error: " + (err.reason || err.message);
        statusEl.className = "status-msg status-error";
    }
}

// Custom File Input UI
document.getElementById("certImage").addEventListener("change", function () {
    document.getElementById("fileName").innerText =
        this.files[0] ? this.files[0].name : "No file chosen";
});

// --- Bulk Issuance (unchanged) ---
function addBulkItem() {
    const list = document.getElementById("bulk-list");
    const id = Date.now();

    const div = document.createElement("div");
    div.className = "bulk-item";
    div.id = `item-${id}`;
    div.innerHTML = `
        <input type="text" placeholder="Student Name" class="bulk-name">
        <input type="file" class="bulk-file">
        <button onclick="removeBulkItem(${id})" class="btn btn-secondary" style="padding:0.5rem">X</button>
    `;
    list.appendChild(div);
}

function removeBulkItem(id) {
    document.getElementById(`item-${id}`).remove();
}

async function issueBulkCertificates() {
    if (!contract) return alert("Connect Wallet first!");

    const items = document.querySelectorAll(".bulk-item");
    if (items.length === 0) return alert("Add students first.");

    const statusEl = document.getElementById("bulkStatus");
    const names = [];
    const files = [];

    for (const item of items) {
        const name = item.querySelector(".bulk-name").value;
        const file = item.querySelector(".bulk-file").files[0];
        if (!name || !file) return alert("All fields are required.");
        names.push(name);
        files.push(file);
    }

    try {
        statusEl.innerText = "Uploading files to IPFS...";
        statusEl.className = "status-msg status-loading";

        const cids = [];
        for (let i = 0; i < files.length; i++) {
            const cid = await uploadToIPFS(files[i]);
            cids.push(cid);
        }

        statusEl.innerText = "Sending batch transaction...";

        const tx = await contract.issueCertificatesBatch(names, cids);
        await tx.wait();

        statusEl.innerText = "Batch Issuance Successful!";
        statusEl.className = "status-msg status-success";

        document.getElementById("bulk-list").innerHTML = "";

    } catch (err) {
        console.error(err);
        statusEl.innerText = "Error: " + err.message;
        statusEl.className = "status-msg status-error";
    }
}

// --- Verification ---
async function verifyCertificate() {
    console.log("VERIFY BUTTON CLICKED");

    const resultDiv = document.getElementById("verificationResult");
    if (!resultDiv) {
        console.error("Verification result element not found!");
        return;
    }

    // Reset and show container
    resultDiv.innerHTML = "";
    resultDiv.classList.remove("hidden");

    if (!contract) {
        resultDiv.innerHTML = `<p style="color:red;">❌ Please connect wallet first.</p>`;
        return;
    }

    const id = document.getElementById("searchId").value.trim();
    if (!id) {
        resultDiv.innerHTML = `<p style="color:red;">❌ Please enter a Certificate ID.</p>`;
        return;
    }

    try {
        resultDiv.innerHTML = `<p style="color:var(--text-muted);">Searching for certificate...</p>`;

        const cert = await contract.getCertificate(id);
        console.log("CERT DATA:", cert);

        /**
         * IMPORTANT:
         * Adjust indexing if your contract returns array.
         * Common pattern:
         * cert[0] -> studentName
         * cert[1] -> ipfsHash (CID)
         * cert[2] -> issuer
         */
        const studentName = cert.studentName || cert[0];
        const ipfsHash = cert.ipfsHash || cert[1];
        const issuer = cert.issuer || cert[2];

        // Basic check if certificate exists (usually name is not empty)
        if (!studentName) {
            throw new Error("Certificate not found");
        }

        const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

        resultDiv.innerHTML = `
            <div style="
                padding:18px;
                border-radius:10px;
                background:#0f172a;
                border:1px solid #22c55e;
                color:#e5e7eb;
            ">
                <h3 style="color:#22c55e; margin-top:0;">✅ Certificate Verified</h3>

                <p><strong>Certificate ID:</strong> ${id}</p>
                <p><strong>Student Name:</strong> ${studentName}</p>
                <p><strong>Issued By:</strong> ${issuer}</p>

                <div style="margin-top:12px;">
                    <a
                        href="${ipfsUrl}"
                        target="_blank"
                        rel="noopener noreferrer"
                        style="
                            display:inline-block;
                            padding:10px 14px;
                            background:#2563eb;
                            color:white;
                            border-radius:6px;
                            text-decoration:none;
                            font-weight:500;
                        "
                    >
                        📄 View Certificate on IPFS
                    </a>
                </div>
            </div>
        `;
    } catch (err) {
        console.error("VERIFY ERROR:", err);

        resultDiv.innerHTML = `
            <div style="
                padding:15px;
                border-radius:8px;
                background:#1f2933;
                border:1px solid #ef4444;
                color:#fca5a5;
            ">
                <h3 style="color:#ef4444; margin-top:0;">❌ Certificate Not Found</h3>
                <p>The entered Certificate ID does not exist or is invalid.</p>
            </div>
        `;
    }
}
window.verifyCertificate = verifyCertificate;