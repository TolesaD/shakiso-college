require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors({origin:'*'}));
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser:true,
    useUnifiedTopology:true
}).then(()=>console.log("MongoDB connected")).catch(console.error);

// Routes
app.use("/api/admin", require("./routes/admin"));
app.use("/api", require("./routes/public"));

// Test route
app.get("/", (_,res)=>res.send("Shakiso Poly-Technic College Backend API Running"));

app.listen(PORT, ()=>console.log(`Server running on PORT ${PORT}`));