const mongoose = require('mongoose');

const connectToMongo =()=>{
    mongoose.connect(process.env.MONGO)
}

module.exports = connectToMongo;