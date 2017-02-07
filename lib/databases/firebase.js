'use strict';

var util = require('util'),
    Session = require('../sessionInterface'),
    use = require('../use'),
    firebase = use('firebase'),
    admin = use('firebase-admin'),
    _ = require('lodash');

function cleanSessionData(json) {
  if (!json) {
    return json;
  }

  var data = {};
  for (var i in json) {
    data[i] = json[i];
    if (data[i] instanceof Object) {
      if ('low_' in data[i] || 'high_' in data[i]) {
        data[i] = data[i].toNumber();
      }
    }
  }
  return data;
}

function firebaseObjectToArray(object) {
  if (!object) {
    return [];
  }
  return Object.keys(object).map(key => object[key]);
}

var FireBaseSessionStore = function (options) {
  options = options || {};

  Session.Store.call(this, options);

  var defaults = {
    collectionName: 'sessions',
    ttl:  60 * 60 * 24 * 14 // 14 days
  };

  _.defaults(options, defaults);

  this.options = options;
};

util.inherits(FireBaseSessionStore, Session.Store);

_.extend(FireBaseSessionStore.prototype, {

  connect: function (callback) {
    var options = this.options;

    var databaseURL;
    var credential;

    if (options.url) {
      databaseURL = options.url;
    }
    if (options.cert) {
      credential =  admin.credential.cert(options.cert);
    }

    admin.initializeApp({
      databaseURL: databaseURL,
      credential: credential
    }, 'sessino');

    this.db = admin.database();
  },

  set: function (sid, sess, callback) {
    var sess = JSON.parse(JSON.stringify(sess));
    if (sess && sess.cookie && sess.cookie.expires) {
      sess.expires = new Date(sess.cookie.expires);
    } else {
      // If there's no expiration date specified, it is
      // browser-session cookie or there is no cookie at all,
      // as per the connect docs.
      //
      // So we set the expiration to two-weeks from now
      // - as is common practice in the industry (e.g Django) -
      // or the default specified in the options.
      sess.expires = new Date(Date.now() + this.options.ttl * 1000);
    }

    sess.cookie.expires = sess.expires;
    sess.cookie.originalMaxAge = sess.cookie.originalMaxAge || "";

    sess._id = sid;

    var query = {
      _id: sid
    };

    this.db.ref(this.options.collectionName + '/' + sess._id).set(sess).then(function(res) {
      if (callback) callback(null, sess);
    })
    .catch(function(err) {
        if (callback) callback(err);
    });
  },

  get: function (sid, callback) {
    this.db.ref(this.options.collectionName + '/' + sid)
      .once('value')
      .then(function (res){
        var data = res.val();
        if (data && (!data.expires || data.expires > new Date())) {
          var session_data = cleanSessionData(data);
          if (callback) {
            callback(null, session_data);
          }
          return;
        }
        if (callback) callback('No result found.');
      }).catch(callback);
  },

  destroy: function (sid, callback) {
    this.db.ref(this.options.collectionName + '/' + sid).remove().then(callback).catch(callback);
  },

  length: function (callback) {
    this.db.ref(this.options.collectionName)
      .once('value')
      .then(function (res){
        callback(firebaseObjectToArray(res.val()).length);
      });
  },

  all: function (callback) {
    var arr = [];
    this.db.ref(this.options.collectionName)
      .once('value')
      .then(function (res){
        var data = firebaseObjectToArray(res.val());
        data.forEach(function (d) {
          d = cleanSessionData(d);
          arr.push(d);
        });
        callback(null, arr);
      });
  },

  clear: function (callback) {
    this.db.ref(this.options.collectionName).remove().then(callback).catch(callback);
  }

});

module.exports = FireBaseSessionStore;

