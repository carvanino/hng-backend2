import express from 'express';
import axios from "axios"
import cors from "cors";
import { createServer } from "http";
import rateLimit from "express-rate-limit";
import 'dotenv/config';

const { BASE_URL, PORT } = process.env;

const API_PATH = `/api`;

const app = express();
app.use(cors());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { status: 429, message: "Too many requests, please try again later." },
});

app.use(limiter);

const server = createServer(app);

server.listen(PORT, () => {
    console.log(PORT);
    console.log("Server started successfully");
});

const makeAPIRequest = async (params) => {
    try {
        const requestResponse = await axios.get(BASE_URL, {
            timeout: 15000,
            params: {
                name: params
            }
        });

        const responseStatus = requestResponse.status;
        const responseData = requestResponse.data;

        return responseStatus === 200 ? responseData : {
            status: "error",
            message: "Failed to fetch data from external API"
        }
    } catch (err) {
        return {
            status: "error",
            message: "Failed to fetch data from external API"
        };
    }
}

app.get(API_PATH + "/classify", async (req, res) => {
    const { name } = req.query;
    if (!name || name.trim() === "") {
        return res.status(400).send({
            status: "error",
            message: "400 Bad Request: Missing or empty name parameter"
        });
    }
    if (typeof name !== "string") {
        return res.status(422).send({
            status: "error",
            message: "422 Unprocessable Entity: name is not a string"
        });
    }
    const response = await makeAPIRequest(name);

    console.log("This is the response from the API", response);
    if (!response.gender || response.count === 0) {
        return res.status(500).send({
            status: "error",
            message: "No prediction available for the provided name"
        });
    }


    const responseData = {
        status: "success",
        data: {
            name: response.name,
            gender: response.gender,
            probability: response.probability,
            sample_size: response.count,
            is_confident: response.probability >= 0.7 && response.count >= 100 ? true : false,
            processed_at: new Date().toISOString(),
        }
    }

    return res.status(200).send(responseData);
});

app.get(API_PATH + "/", async (req, res) => {
    res.send({
        status: 200,
        message: "Welcome Home"
    })
});

