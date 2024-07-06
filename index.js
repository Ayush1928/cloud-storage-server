const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { BlobServiceClient } = require("@azure/storage-blob");
require("dotenv").config();
const { DefaultAzureCredential } = require("@azure/identity");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);

// Handle File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

app.post("/container/create", async (req, res) => {
  try {
    const containerName = req.body.id;
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const createContainerResponse = await containerClient.create();
    console.log(
      `Container was created successfully.\n\trequestId:${createContainerResponse.requestId}\n\tURL: ${containerClient.url}`
    );

    res.status(201).json({
      message: "Container was created successfully",
      requestId: createContainerResponse.requestId,
      url: containerClient.url,
    });
  } catch (error) {
    console.error(`Error creating container: ${error.message}`);

    res.status(500).json({
      message: "Error creating container",
      error: error.message,
    });
  }
});

app.get("/container/view", async (req, res) => {
  try {
    const containerName = req.query.id;

    if (!containerName) {
      return res.status(400).json({ message: "Container ID is required" });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobs = [];

    for await (const blob of containerClient.listBlobsFlat()) {
      const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
      blobs.push({ name: blob.name, url: blockBlobClient.url });
    }

    res.status(200).json({ blobs });
  } catch (error) {
    console.error(`Error retrieving blobs: ${error.message}`);
    res
      .status(500)
      .json({ message: "Error retrieving blobs", error: error.message });
  }
});

app.post("/blob/create", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const containerName = req.body.id;
    const blobName = req.file.filename;
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    console.log(
      `\nUploading to Azure storage as blob\n\tname: ${blobName}\n\tURL: ${blockBlobClient.url}`
    );

    const uploadBlobResponse = await blockBlobClient.uploadFile(req.file.path);
    console.log(`Blob was uploaded successfully. requestId: ${uploadBlobResponse.requestId}`);

    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: "File uploaded successfully",
      blobUrl: blockBlobClient.url,
      requestId: uploadBlobResponse.requestId
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Error uploading file", error: error.message });
  }
});

app.delete("/blob/delete", async (req, res) => {
  try {
    const containerName = req.query.id;
    const blobName = req.query.filename;

    if (!containerName || !blobName) {
      return res.status(400).json({ message: "Container ID and filename are required" });
    }

    const options = {
      deleteSnapshots: 'include'
    };

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.delete(options);

    console.log(`Deleted blob ${blobName} from container ${containerName}`);

    res.status(200).json({ message: `Blob ${blobName} deleted successfully from container ${containerName}` });
  } catch (error) {
    console.error(`Error deleting blob: ${error.message}`);
    res.status(500).json({ message: "Error deleting blob", error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
