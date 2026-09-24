const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();

const PORT = 3000;

const ROOT = __dirname;

const PUBLIC_DIR =
    path.join(ROOT, "public");

const UPLOAD_DIR =
    path.join(ROOT, "uploads");

const OUTPUT_DIR =
    path.join(ROOT, "outputs");

[
    UPLOAD_DIR,
    OUTPUT_DIR
].forEach(dir => {

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }

});


app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(
    express.static(PUBLIC_DIR)
);

app.use(
    "/outputs",
    express.static(OUTPUT_DIR)
);


/* =========================
   MULTER
========================= */

const storage =
    multer.diskStorage({

        destination:
            (req, file, cb) => {

                cb(
                    null,
                    UPLOAD_DIR
                );

            },

        filename:
            (req, file, cb) => {

                const ext =
                    path.extname(
                        file.originalname
                    );

                const filename =
                    Date.now() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .slice(2) +
                    ext;

                cb(
                    null,
                    filename
                );

            }

    });


const upload =
    multer({

        storage,

        limits: {
            fileSize:
                100 * 1024 * 1024
        }

    });


/* =========================
   PYTHON RUNNER
========================= */

function runPython(args) {

    return new Promise(
        (resolve, reject) => {

            const pythonCommand =
                process.platform === "win32"
                    ? "python"
                    : "python3";

            const processRunner =
                spawn(
                    pythonCommand,
                    [
                        "clone.py",
                        ...args
                    ],
                    {
                        cwd: ROOT
                    }
                );

            let stdout = "";
            let stderr = "";

            processRunner.stdout.on(
                "data",
                data => {
                    stdout +=
                        data.toString();
                }
            );

            processRunner.stderr.on(
                "data",
                data => {

                    stderr +=
                        data.toString();

                    console.log(
                        data.toString()
                    );

                }
            );

            processRunner.on(
                "error",
                reject
            );

            processRunner.on(
                "close",
                code => {

                    if (code !== 0) {

                        reject(
                            new Error(
                                stderr ||
                                stdout ||
                                "Python process failed"
                            )
                        );

                        return;
                    }

                    try {

                        const lines =
                            stdout
                                .trim()
                                .split("\n");

                        const lastLine =
                            lines[
                                lines.length - 1
                            ];

                        resolve(
                            JSON.parse(
                                lastLine
                            )
                        );

                    } catch (error) {

                        reject(
                            new Error(
                                stdout ||
                                stderr ||
                                "Invalid Python response"
                            )
                        );

                    }

                }
            );

        }
    );

}


/* =========================
   HEALTH
========================= */

app.get(
    "/api/health",
    (req, res) => {

        res.json({
            success: true,
            app: "VoiceClone AI",
            status: "running"
        });

    }
);


/* =========================
   CREATE VOICE PROFILE
========================= */

app.post(
    "/api/profile",
    upload.single("voice"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400)
                    .json({
                        success: false,
                        error:
                            "Voice sample is required."
                    });

            }

            const result =
                await runPython([
                    "--profile",
                    req.file.path
                ]);

            res.json(result);

        } catch (error) {

            console.error(error);

            res.status(500)
                .json({
                    success: false,
                    error:
                        error.message
                });

        }

    }
);


/* =========================
   VOICE CONVERSION
========================= */

app.post(
    "/api/clone",
    upload.fields([
        {
            name: "source",
            maxCount: 1
        },
        {
            name: "reference",
            maxCount: 1
        }
    ]),
    async (req, res) => {

        try {

            const source =
                req.files?.source?.[0];

            const reference =
                req.files?.reference?.[0];

            if (!source ||
                !reference) {

                return res.status(400)
                    .json({
                        success: false,
                        error:
                            "Source and reference audio are required."
                    });

            }

            const outputName =
                "clone-" +
                Date.now() +
                ".wav";

            const output =
                path.join(
                    OUTPUT_DIR,
                    outputName
                );

            const result =
                await runPython([
                    "--clone",
                    source.path,
                    reference.path,
                    "--output",
                    output
                ]);

            res.json({
                success: true,
                audio:
                    "/outputs/" +
                    outputName,
                result
            });

        } catch (error) {

            console.error(error);

            res.status(500)
                .json({
                    success: false,
                    error:
                        error.message
                });

        }

    }
);


/* =========================
   TEXT TO VOICE
========================= */

app.post(
    "/api/speak",
    upload.single("reference"),
    async (req, res) => {

        try {

            const text =
                req.body.text;

            const language =
                req.body.language || "en";

            if (!text) {

                return res.status(400)
                    .json({
                        success: false,
                        error:
                            "Text is required."
                    });

            }

            if (!req.file) {

                return res.status(400)
                    .json({
                        success: false,
                        error:
                            "Reference voice is required."
                    });

            }

            const outputName =
                "voice-" +
                Date.now() +
                ".wav";

            const output =
                path.join(
                    OUTPUT_DIR,
                    outputName
                );

            const result =
                await runPython([
                    "--tts",
                    text,
                    "--language",
                    language,
                    "--reference",
                    req.file.path,
                    "--output",
                    output
                ]);

            res.json({
                success: true,
                audio:
                    "/outputs/" +
                    outputName,
                result
            });

        } catch (error) {

            console.error(error);

            res.status(500)
                .json({
                    success: false,
                    error:
                        error.message
                });

        }

    }
);


/* =========================
   SERVER
========================= */

app.listen(
    PORT,
    () => {

        console.log(
            "================================"
        );

        console.log(
            "VoiceClone AI"
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log(
            "================================"
        );

    }
);
