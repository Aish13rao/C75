import firebase from "firebase";
//require("@firebase/firestore");

var firebaseConfig = {
  apiKey: "AIzaSyBQcdR9lPKn3bxFREzILwtJ3tYquh0wI0Y",
  authDomain: "pro-71-93426.firebaseapp.com",
  projectId: "pro-71-93426",
  storageBucket: "pro-71-93426.appspot.com",
  messagingSenderId: "898421663953",
  appId: "1:898421663953:web:e9517f1f94e1e506af7df0"
};

if(!firebase.apps.length){
  firebase.initializeApp(firebaseConfig);
}


export default firebase.firestore();


