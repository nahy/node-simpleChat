/**
 * Created with JetBrains WebStorm.
 * User: ichai
 * Date: 29.08.13
 * Time: 17:01
 * To change this template use File | Settings | File Templates.
 */
var fs = require('fs'),
    transliteration = require('transliteration.ua'),
    gm = require('gm').subClass({ imageMagick: true }),
    io = require('socket.io').listen(8080);
    mongoose = require('mongoose');
    var config = require('./config');

// Массив с именами подключенных пользователей
var usernames = {};

//io.set('log level', 2);


mongoose.connect(config.dbUrl, function (err) {
    if (err) {
        console.log(err);
    }
});

var Chat = require('./app/models/Chat');


io.sockets.on('connection', function (socket) {
    // Загрузка старых сообщений
    var query = Chat.find({});
    query.sort('-created').limit(10).exec(function (err, docs) {
        if (err) throw err;
        socket.emit('load old msgs', docs);
    });

    // when the client emits 'sendchat', this listens and executes
    socket.on('sendchat', function (data,callback) {
        // Обработка от нападения
        var message = data.trim();
        // является ли сообщение приватным?
        if(message.substr(0,3) === '/w '){
            message = message.substr(3);
            var ind = message.indexOf(' ');
            if(ind !== -1){
                var name = message.substring(0, ind),
                    message = message.substring(ind + 1),
                    type = 'wisper';
                if(name in usernames){
                    usernames[name].emit('updatechat', {nick: socket.username + ' &rarr; ' + name, msg: message, created: Date.now(), type: type, id: '0'});
                    socket.emit('updatechat', {nick: socket.username + ' &rarr; ' + name, msg: message, created: Date.now(), type: type, id: '0'});
                } else{
                    callback('Ошибка! Введите необходимое имя пользователя.');
                }
            } else{
                callback('Ошибка! Введите сообщение для отправки');
            }
        // сообщение не приватное
        } else{
            var newMsg = new Chat({nick: socket.username, msg: message});

            newMsg.save(function (err) {
                if (err) throw err;
                io.sockets.emit('updatechat', {nick: socket.username, msg: message, created: Date.now(), id: newMsg['_id'], type: ''});
            });
        }



    });

    socket.on('user image', function (name, buffer) {
        var trfile = Math.floor((Math.random() * 1000) + 1) + '-' + transliteration.ua.transliterate(name),//берём файл и добавляем случайное число, чтобы не повторяться
            path = '/home/ichai/project/chat/upload/',               //папка назначения
            fileName = path + trfile,                                //формируем путь файла
            data_url = buffer,                                       //получаем все данные из буфера
            matches = data_url.match(/^data:.+\/(.+);base64,(.*)$/), //разделяем и влавствуем
            //ext = matches[1],
            base64_data = matches[2],
            buffer = new Buffer(base64_data, 'base64');              //Раскодируем обратно
        //сохраняем файл на сайт
        fs.writeFile(fileName, buffer, function (err) {
            if (err) throw err;

            //Сжимаем изображение
            var fileName_small = path + 'small_' + trfile;
            gm(fileName)
                .resize(240)
                .write(fileName_small, function (err) {
                    if (err) throw err;                               //Формируем ссылку на изображение и маленькое изображение
                    var link = '<a href="upload/' + trfile + '" target="_blank"><img src="upload/small_' + trfile + '"/></a>';
                    var newMsg = new Chat({nick: socket.username, msg: link});   //сохраняем сообщение в базу
                    newMsg.save(function (err) {
                        if (err) throw err;                                      //отправляем сообщение в чат
                        io.sockets.emit('updatechat', {nick: socket.username, msg: link, created: Date.now(), id: newMsg['_id']});
                    });
                });
        });

    });

    // Вход для зарегестрированного на сайте
    socket.on('adduser', function (username) {
        //записываем имя клиента в сокет
        socket.username = username;
        //записываем айди сокета в массив имён
        usernames[username] = socket;
        // Сообщение клиенту что он подключился
        socket.emit('updatechat', {nick: 'SERVER', msg: 'вы подключены к чату', created: Date.now(), id: '0', type: 'system'});
        // Сообщение что всем что он вошёл
        //socket.broadcast.emit('updatechat', {nick: 'SERVER', msg: username + ' подключился', created: Date.now()});
        // Апдейт участинков чата на стороне клиента
        io.sockets.emit('updateusers', Object.keys(usernames));

    });

    // Удаление сообщений
    socket.on('killMsg', function (messageId) {
        if (messageId != '0') {
            Chat.remove({_id: messageId}, function (err) {
                if (err) throw err;
                io.sockets.emit('deleteMsg', messageId);
            });
        }
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function () {
        // remove the username from global usernames list
        delete usernames[socket.username];
        // update list of users in chat, client-side
        io.sockets.emit('updateusers', Object.keys(usernames));
        // echo globally that this client has left
        //socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
    });
});