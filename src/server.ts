import { startServer } from "./app.js";
import "./workers/resume-parser.worker.js";
import "./workers/candidate-scorer.worker.js";
import "./workers/hiring-recommender.worker.js";

startServer();
