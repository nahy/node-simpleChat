
var mongoose = require('mongoose');

var chatSchema = mongoose.Schema({
    nick: String,
    msg: String,
    created: {type: Date, default: Date.now}
});

module.exports = mongoose.model('Chat', chatSchema);
