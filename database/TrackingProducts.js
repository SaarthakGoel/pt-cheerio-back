const mongoose = require("mongoose");

const TrackingSchema =  new mongoose.Schema({
  name : String,
  price : {
    type : String,
    required : true 
  },
  link : {
    type : String,
    required : true 
  },
  affiliateLink : {
    type : String,
    required : true
  },
  email : {
    type : String,
    required : true 
  },
})

module.exports = mongoose.model('TrackingProduct' , TrackingSchema);