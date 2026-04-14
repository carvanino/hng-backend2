import express from "express";
import axios from "axios";
import cors from "cors";
import { createServer } from "http";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import { v7 as uuid } from "uuid";

const { PORT, GENDERIZE_URL, AGIFY_URL, NATIONALIZE_URL } = process.env;

const API_PATH = "/api";
const DATABASE = [];

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const app = express();
app.use(express.json());
app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: "error", message: "Too many requests, please try again later." },
});
app.use(limiter);

const server = createServer(app);

const toUtcIso8601 = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const classifyAgeGroup = (age) => {
  if (age >= 0 && age <= 12) return "child";
  if (age >= 13 && age <= 19) return "teenager";
  if (age >= 20 && age <= 59) return "adult";
  return "senior";
};

const validateName = (name) => {
  if (name === undefined || name === null) {
    throw new ApiError(400, "Missing or empty name");
  }

  if (typeof name !== "string") {
    throw new ApiError(422, "Invalid type");
  }

  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    throw new ApiError(400, "Missing or empty name");
  }

  return normalized;
};

const invalidExternalResponse = (externalApi) => {
  throw new ApiError(502, `${externalApi} returned an invalid response`);
};

const makeAPIRequest = async (url, name, externalApi) => {
  if (!url) {
    throw new ApiError(500, "Internal server error");
  }

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      params: { name },
    });

    if (response.status !== 200 || !response.data || typeof response.data !== "object") {
      invalidExternalResponse(externalApi);
    }

    return response.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    invalidExternalResponse(externalApi);
  }
};

const getGenderPrediction = async (name) => {
  const response = await makeAPIRequest(GENDERIZE_URL, name, "Genderize");

  if (response.gender === null || Number(response.count) === 0) {
    invalidExternalResponse("Genderize");
  }

  return {
    gender: response.gender,
    gender_probability: response.probability,
    sample_size: response.count,
  };
};

const getAgePrediction = async (name) => {
  const response = await makeAPIRequest(AGIFY_URL, name, "Agify");

  if (response.age === null) {
    invalidExternalResponse("Agify");
  }

  return {
    age: response.age,
    age_group: classifyAgeGroup(response.age),
  };
};

const getCountryPrediction = async (name) => {
  const response = await makeAPIRequest(NATIONALIZE_URL, name, "Nationalize");
  const countries = Array.isArray(response.country) ? response.country : [];

  if (countries.length === 0) {
    invalidExternalResponse("Nationalize");
  }

  const topCountry = countries.reduce((best, current) => {
    if (!best || current.probability > best.probability) {
      return current;
    }
    return best;
  }, null);

  return {
    country_id: topCountry.country_id,
    country_probability: topCountry.probability,
  };
};

const findProfileByName = (name) => DATABASE.find((item) => item.name === name);
const findProfileIndexById = (id) => DATABASE.findIndex((item) => item.id === id);

const sendError = (res, error) => {
  if (error instanceof ApiError) {
    return res.status(error.status).send({
      status: "error",
      message: error.message,
    });
  }

  return res.status(500).send({
    status: "error",
    message: "Internal server error",
  });
};

app.get(API_PATH + "/classify", async (req, res) => {
  try {
    const name = validateName(req.query.name);
    const data = await getGenderPrediction(name);

    return res.status(200).send({
      status: "success",
      data: {
        name,
        ...data,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

app.post(API_PATH + "/profiles", async (req, res) => {
  try {
    const name = validateName(req.body?.name);
    const existing = findProfileByName(name);

    if (existing) {
      return res.status(200).send({
        status: "success",
        message: "Profile already exists",
        data: existing,
      });
    }

    const [genderData, ageData, countryData] = await Promise.all([
      getGenderPrediction(name),
      getAgePrediction(name),
      getCountryPrediction(name),
    ]);

    const profile = {
      id: uuid(),
      name,
      ...genderData,
      ...ageData,
      ...countryData,
      created_at: toUtcIso8601(),
    };

    DATABASE.push(profile);

    return res.status(201).send({
      status: "success",
      data: profile,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

app.get(API_PATH + "/profiles", (req, res) => {
  const { gender, country_id: countryId, age_group: ageGroup } = req.query;

  const filters = {
    gender: typeof gender === "string" ? gender.toLowerCase() : undefined,
    country_id: typeof countryId === "string" ? countryId.toLowerCase() : undefined,
    age_group: typeof ageGroup === "string" ? ageGroup.toLowerCase() : undefined,
  };

  const filteredProfiles = DATABASE.filter((profile) => {
    if (filters.gender && profile.gender.toLowerCase() !== filters.gender) {
      return false;
    }

    if (filters.country_id && profile.country_id.toLowerCase() !== filters.country_id) {
      return false;
    }

    if (filters.age_group && profile.age_group.toLowerCase() !== filters.age_group) {
      return false;
    }

    return true;
  }).map((profile) => ({
    id: profile.id,
    name: profile.name,
    gender: profile.gender,
    age: profile.age,
    age_group: profile.age_group,
    country_id: profile.country_id,
  }));

  return res.status(200).send({
    status: "success",
    count: filteredProfiles.length,
    data: filteredProfiles,
  });
});

app.get(API_PATH + "/profiles/:id", (req, res) => {
  const profile = DATABASE.find((item) => item.id === req.params.id);

  if (!profile) {
    return res.status(404).send({
      status: "error",
      message: "Profile not found",
    });
  }

  return res.status(200).send({
    status: "success",
    data: profile,
  });
});

app.delete(API_PATH + "/profiles/:id", (req, res) => {
  const index = findProfileIndexById(req.params.id);

  if (index === -1) {
    return res.status(404).send({
      status: "error",
      message: "Profile not found",
    });
  }

  DATABASE.splice(index, 1);
  return res.status(204).send();
});

app.get(API_PATH + "/", async (req, res) => {
  res.send({
    status: 200,
    message: "Welcome Home",
  });
});

server.listen(PORT, () => {
  console.log(PORT);
  console.log("Server started successfully");
});
