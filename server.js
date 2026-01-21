const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const upload = multer(); // Handle multipart/form-data in memory

app.use(cors());

// POST /upload
app.post('/upload', upload.single('file'), async (req, res) => {
    console.log("➡️ /upload HIT");
    if (!req.file) {
        return res.status(400).send("No file uploaded.");
    }

    try {
        const formData = new FormData();
        // req.file.buffer is the file content in memory
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        // Optional Pinata Metadata
        const metadata = JSON.stringify({
            name: req.file.originalname,
        });
        formData.append('pinataMetadata', metadata);

        const pinataOptions = JSON.stringify({
            cidVersion: 0,
        });
        formData.append('pinataOptions', pinataOptions);

        const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
            headers: {
                'Authorization': `Bearer ${process.env.PINATA_JWT}`,
                ...formData.getHeaders() // Important for boundary
            }
        });

        // Return the CID to the frontend
        res.json({
            cid: response.data.IpfsHash
        });

    } catch (error) {
        console.error("Backend Upload Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Failed to upload to IPFS" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
