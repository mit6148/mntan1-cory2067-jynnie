import { Template } from 'meteor/templating';
import { Random } from 'meteor/random'
import { EditUsers } from '../../collections/editusers'
import { Session } from 'meteor/session'
import { Tracker } from 'meteor/tracker'
import { Changes } from '../../collections/changes'
import { EditorContents } from '../../collections/editor'
import { Meteor } from 'meteor/meteor';

var fileName = "meme.py";
var username = "Guest"
var userId = null ;
var lock = ['self'];
var doc = null;
var editId = null;
var init = true;

Template.EditorPage.onRendered(() => {
    lock = ['self'];
    Session.set("lock", ['self']);
    doc = $('.CodeMirror')[0].CodeMirror;
    var id = FlowRouter.getParam("editID");
    /*etTimeout(function(){
    var updates = EditorContents.find({editor:id,file:fileName}).fetch();
    try{
      console.log(updates)
      console.log(EditorContents.find().fetch());
      doc.setValue(updates[updates.length-2].doc);
    } catch(e) { console.log("FUCK")}
  }, 1000); */

    Changes.find({editor:id, file:fileName}).observe({
        _suppress_initial: true,
        added: function (changes) {
          console.log(changes);
          if(changes['user'] != userId) {
            //console.log(changes);
            doc.replaceRange(changes['text'], changes['from'], changes['to'], origin='ignore');

            //sketchy stuff for special cases when highlighting other user text
            var removedLen = changes['removed'].length
            if(changes['removed'][0] == "") {
                removedLen = 0;
              }

            //there's a case when i need to shift the highlighted lines
            if(removedLen != 1 && !changes['text'][0]) {
              changes['text'].splice(0,1);
              changes['from']['line']++;
              changes['to']['line']++;
            }

            if(changes['text'].length || removedLen==1) {
              var mark = doc.markText({line: changes['from']['line'], ch:0}, {line: changes['to']['line']+changes['text'].length-1}, {className: "editing"});
              setTimeout(function() {
                mark.clear();
              }, 1000);
            }
          }
        },
        changed: function (changes, old) {
        },
        removed: function (i) {

       }
     });

    var current = EditUsers.find({editor: id, file: fileName}).fetch();
    Tracker.autorun(function (c) {
      if(!Meteor.user()) {
        return;
      }
      username = Meteor.user()['emails'][0]['address'];
      EditUsers.insert({name: username, editor: id, file: fileName, line: 0, init:true}, function(err, _id) {
          userId = _id;
          Session.set("userId", _id);
          Session.set("editing", true);
          console.log("addd user");
          if(current.length) {
            console.log("ur not the first one");
            EditorContents.find({editor: id, file:fileName}).observe({
              changed: function(changed, o) {
                console.log("here's what i found:")
                console.log(changed)
                if(init){
                  doc.setValue(changed.doc);
                  init = false;
                  EditUsers.update({_id: userId}, {$set: {init: false}});
                  lock.splice(0,1);//remove self from lock
                  Session.set("lock", lock);
                }
              }
            });
          } else {
            console.log("ur apparently the first");
            console.log(FlowRouter.getParam("editID"));
            Meteor.call("openFile", FlowRouter.getParam("editID"));
            EditorContents.find({editor: id, file: fileName, user:'system'}).observe({
              added: function(changed, o) {
                doc.setValue(changed.doc); //wew laddie copy and pasting code
                init = false;              //maybe someday, i'll make this not trash
                EditUsers.update({_id: userId}, {$set: {init: false}});
                lock.splice(0,1); //this is gross, but just delet lock if you're the first to join
                Session.set("lock", lock);
              }
            });
          }

          EditorContents.insert({editor: id, file:fileName, user: userId, doc: "", refresh:""}, function(err, _id) {
            editId = _id;
          });
          setInterval(() => {
            EditorContents.update({_id: editId}, {$set: {doc: doc.getValue()}});
          },5000); //periodically save
      });
    });
    EditUsers.find({editor: id, file:fileName}).observe({
      _suppress_initial: true,
      added: function(changed, o) {
        if(changed['init']) {
          //Meteor.call("deleteChanges", [id, fileName]);
          EditorContents.update({_id: editId}, {$set: {doc: doc.getValue(), refresh:Random.id()}});
          lock.push(changed['name']);
          Session.set("lock", lock);
          console.log("loked thanks to " + changed['name'])
          //setTimeout(()=>{lock--; console.log("unloked");}, 5000);
        }
      },
      changed: function(changed, o) {
        if(!changed['init']) {
          var index = lock.indexOf(changed['name']);
          if(index > -1) {
            console.log("unlocked!");
            lock.splice(index, 1);
            Session.set("lock", lock);
          }
        }
      }
    });

    Tracker.autorun(function (c) {
      console.log("Tracker fired! Lock is now " + Session.get("lock"));
    });
});

Template.EditorHead.helpers({
  getFileName() {
    return fileName;
  },

  getURL(){
    return FlowRouter.getParam("editID");
  },
});

Template.EditorSidebar.helpers({
  editingUsers() {
    return EditUsers.find({editor: FlowRouter.getParam("editID")}).fetch();
  }
});

Template.FileTabs.helpers({
  getFileName() {
    return fileName;
  }
});

Template.EditorPage.helpers({
  lockUser() {
    var l = Session.get("lock");
    if(l && l.length) {
      return l[0];
    }
    else {
      return null;
    }
  },

  editingUsers() {
    return EditUsers.find({editor: FlowRouter.getParam("editID")}).fetch();
  },

  editorOptions() {
      return {
          lineNumbers: true,
          mode: "python",
          theme: "night",
          keyMap: "vim",
          indentUnit: 4,
          indentWithTabs: true,
          autoCloseBrackets: true,
          matchBrackets: true,
          matchTags: true,
          autoCloseTags: true,
          lineWrapping: true
      }
    },

    editorEvents() {
       return {
         "beforeChange": function(doc, change) {
           if(lock.length && change['origin'] != 'setValue' && change['origin'] != 'ignore') {
             change.cancel();
           }
         },
         "change": function(doc, change){
           EditUsers.update({_id:userId}, {$set: {line:doc.getCursor()['line']}});
           if(change['origin'] != 'ignore' && change['origin'] != 'setValue'){
            change['editor'] = FlowRouter.getParam("editID");
            change['file'] = fileName;
            change['user'] = userId;
            change['time'] = (new Date()).toJSON();
            Changes.insert(change);
          }
         },
        "cursorActivity": function(doc) {
            EditUsers.update({_id:userId}, {$set: {line:doc.getCursor()['line']}});
        }
      }
    },

  editorCode() {
      return '';
  }
});

Template.EditorPage.onDestroyed(function() {
  EditUsers.remove({_id : userId});
});
