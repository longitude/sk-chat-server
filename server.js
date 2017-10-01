const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const MongoClient = require("mongodb").MongoClient;
const URL = "mongodb://localhost:27017/chatserver";
let db;

MongoClient.connect(URL, function(err, database) {
  if (err) return;

  console.log("connected to mongo");

  db = database;

  db.createCollection(
    "messages",
    {
      validator: {
        $and: [
          { to: { $type: "string" } },
          { from: { $type: "string" } },
          { group: { $type: "boolean" } },
          { message: { $type: "string" } },
          { messageTime: { $type: "timestamp" } }
        ]
      },
      validationAction: "warn"
    },
    function(err, res) {
      console.log("Collection messages created");
    }
  );
  db.createCollection(
    "users",
    {
      validator: {
        $and: [
          { userName: { $exists: true } },
          { userName: { $type: "string" } },
          { firstName: { $exists: true } },
          { firstName: { $type: "string" } },
          { lastName: { $exists: true } },
          { lastName: { $type: "string" } },
          { logoutTime: { $type: "timestamp" } }
        ]
      },
      validationAction: "warn"
    },
    function(err, res) {
      console.log("Collection users created");
    }
  );

  db.createCollection(
    "rooms",
    {
      validator: {
        $and: [
          { roomName: { $exists: true } },
          { roomName: { $type: "string" } },
          { users: { $exists: true } },
          { users: { $type: "array" } }
        ]
      },
      validationAction: "warn"
    },
    function(err, res) {
      if (err) throw err;
      console.log("Collection rooms created!");
    }
  );
});

const io = require("socket.io").listen(
  app.listen(3000, function() {
    console.log("chat app listening on port 3000!");
  })
);

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use(function(req, res, next) {
  req.io = io;
  next();
});

app.use(bodyParser.json());

app.get("/", function(req, res) {
  res.send("Hello World!");
});

app.post("/logout", function(req, res) {
  var collection = db.collection("users");
  collection.update(
    { userName: req.body.userName },
    { $set: { logoutTime: Date.now() } },
    { upsert: true },
    function(err, logout) {
      if (err) res.send(err);
      res.send(logout);
    }
  );
});

app.post("/messages", function(req, res) {
  var collection = db.collection("messages");
  req.body.messageTime = Date.now();
  collection.insert(req.body, function(err, message) {
    if (err) res.send(err);
    req.body._id = message.insertedIds[0];
    req.io.emit("socket-post-message-room", req.body);
    res.send(req.body);
  });
});

app.get("/messages", function(req, res) {
  var collection = db.collection("messages");
  var result;
  if (req.query["from"]) {
    collection
      .find({ to: req.query["to"], from: req.query["from"] })
      .toArray(function(err, messages) {
        if (err) res.send(err);
        result = messages;
        collection
          .find({ to: req.query["from"], from: req.query["to"] })
          .toArray(function(err, newMessages) {
            if (err) res.send(err);
            let allMessages = newMessages.concat(messages).sort(function(a, b) {
              return a.messageTime > b.messageTime;
            });
            res.json(allMessages);
          });
      });
  } else {
    collection.find({ to: req.query["to"] }).toArray(function(err, messages) {
      if (err) res.send(err);
      res.json(messages);
    });
  }
});

app.post("/users", function(req, res) {
  var collection = db.collection("users");
  req.body.logoutTime = Date.now();
  collection.insert(req.body, function(err, messages) {
    if (err) res.send(err);
    res.send(messages);
  });
});

app.get("/users", function(req, res) {
  var collection = db.collection("users");
  var query = req.query["username"] ? { userName: req.query["username"] } : {};
  collection.find(query).toArray(function(err, users) {
    if (err) res.send(err);
    res.json(users);
  });
});

app.post("/roomusers", function(req, res) {
  var collection = db.collection("rooms");
  var query = req.body.roomName ? { roomName: req.body.roomName } : {};

  collection.update(
    { roomName: req.body.roomName },
    { $push: { users: req.body.userName } },
    function(err, room) {
      if (err) res.send(err);
      res.send(room);
    }
  );
});

app.post("/rooms", function(req, res) {
  var collection = db.collection("rooms");
  collection.insert(req.body, function(err, messages) {
    if (err) res.send(err);
    req.io.emit("socket-post-rooms", { message: req.body });
    res.send(messages);
  });
});

app.get("/rooms", function(req, res) {
  var collection = db.collection("rooms");
  var query = req.query["roomname"] ? { roomName: req.query["roomname"] } : {};
  collection.find(query).toArray(function(err, messages) {
    if (err) res.send(err);
    res.json(messages);
  });
});

app.post("/adduser", function(req, res) {
  User.findOne({ userName: req.body.userName }, function(err, user) {
    if (err) res.send(err);
    if (user) {
      Room.findOne({ roomName: req.body.roomName }, function(err, room) {
        if (err) res.send(err);
        if (room && room.users.indexOf(req.body.userName) < 0) {
          var users = room.users.concat(req.body.userName);
          Room.update({ users: users }, function(err) {
            if (err) res.send(err);
            res.send({ addedUser: true });
          });
        } else {
          res.send({ invalidRoom: true });
        }
      });
    } else {
      res.send({ invalidUser: true });
    }
  });
});
