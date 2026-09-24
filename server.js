const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = 3000;

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const name =
            Date.now() +
            "-" +
            file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");

        cb(null, name);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(
    path.join(__dirname, "public")
));


/*
--------------------------------
VOICE UPLOAD
--------------------------------
*/

app.post(
    "/api/voice",
    upload.single("voice"),
    (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Voice file မတွေ့ပါ။"
            });
        }

        res.json({
            success: true,
            message: "Voice uploaded successfully.",
            filename: req.file.filename,
            path: "/uploads/" + req.file.filename
        });
    }
);


/*
--------------------------------
CREATE VOICE CLONE
--------------------------------
*/

app.post(
    "/api/clone",
    upload.single("voice"),
    (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Voice sample ထည့်ပါ။"
            });
        }

        const voicePath = req.file.path;

        const python = spawn(
            "python",
            [
                "clone.py",
                voicePath
            ]
        );

        let output = "";
        let error = "";

        python.stdout.on(
            "data",
            data => {
                output += data.toString();
            }
        );

        python.stderr.on(
            "data",
            data => {
                error += data.toString();
            }
        );

        python.on(
            "close",
            code => {

                if (code !== 0) {

                    console.error(error);

                    return res.status(500).json({
                        success: false,
                        message:
                            "Voice Clone engine error."
                    });
                }

                res.json({
                    success: true,
                    message:
                        "Voice clone created.",
                    result: output.trim()
                });
            }
        );
    }
);


/*
--------------------------------
TEXT TO CLONED VOICE
--------------------------------
*/

app.post(
    "/api/speak",
    async (req, res) => {

        const text = req.body.text;

        if (!text) {
            return res.status(400).json({
                success: false,
                message: "Text ထည့်ပါ။"
            });
        }

        const python = spawn(
            "python",
            [
                "clone.py",
                "--speak",
                text
            ]
        );

        let output = "";
        let error = "";

        python.stdout.on(
            "data",
            data => {
                output += data.toString();
            }
        );

        python.stderr.on(
            "data",
            data => {
                error += data.toString();
            }
        );

        python.on(
            "close",
            code => {

                if (code !== 0) {

                    console.error(error);

                    return res.status(500).json({
                        success: false,
                        message:
                            "Speech generation failed."
                    });
                }

                res.json({
                    success: true,
                    audio: output.trim()
                });
            }
        );
    }
);


app.listen(
    PORT,
    () => {

        console.log(
            `VoiceClone AI running at http://localhost:${PORT}`
        );

    }
);
