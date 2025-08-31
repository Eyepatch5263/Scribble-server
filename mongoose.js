const mongoose = require("mongoose")
const dotenv = require("dotenv")
dotenv.config()
const connect = async () => {
    const db = process.env.MONGO_DB
    if (mongoose.connection.readyState === 1) {
        console.log("Mongoose is already connected.");
        return;
    }
    try {
        await mongoose.connect(db)
        console.log("Connected to Mongoose Successfully")
    } catch (error) {
        console.log("Error: ", error)
        console.log("Error connecting to mongoose")
    }
}

module.exports = connect