import React, { Component } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  ImageBackground,
  Image,
  Alert,
  KeyboardAvoidingView
} from "react-native";
import * as Permissions from "expo-permissions";
import { BarCodeScanner } from "expo-barcode-scanner";
import firebase from "firebase";
import db from "../config";

const bgImage = require("../assets/background2.png");
const appIcon = require("../assets/appIcon.png");

export default class RideScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      bikeId: "",
      userId: "",
      domState: "normal",
      hasCameraPermissions: null,
      scanned: false,
      bikeType: "",
      userName: "",
      email: firebase.auth().currentUser.email
    };
  }

  async componentDidMount() {
    const { email } = this.state;
    await this.getUserDetails(email);
  }

  getCameraPermissions = async () => {
    const { status } = await Permissions.askAsync(Permissions.CAMERA);

    this.setState({
      /*status === "granted" is true when user has granted permission
          status === "granted" is false when user has not granted the permission
        */
      hasCameraPermissions: status === "granted",
      domState: "scanner",
      scanned: false
    });
  };

  handleBarCodeScanned = async ({ type, data }) => {
    this.setState({
      bikeId: data,
      domState: "normal",
      scanned: true
    });
  };

  handleTransaction = async () => {
    var { bikeId, userId, email } = this.state;
    await this.getBikeDetails(bikeId);

    var transactionType = await this.checkBikeAvailability(bikeId);

    if (!transactionType) {
      this.setState({ bikeId: "" });
      Alert.alert("Kindly enter/scan valid bike id");
    } else if (transactionType === "under_maintenance") {
      this.setState({
        bikeId: ""
      });
    } else if (transactionType === "rented") {
      var isEligible = await this.checkUserEligibilityForStartRide(
        userId,
        email
      );

      if (isEligible) {
        var { bikeType, userName } = this.state;
        this.assignBike(bikeId, userId, bikeType, userName, email);
        Alert.alert(
          "You have rented the bike for next 1 hour. Enjoy your ride!!!"
        );
        this.setState({
          bikeAssigned: true
        });

        // For Android users only
        // ToastAndroid.show(
        //   "You have rented the bike for next 1 hour. Enjoy your ride!!!",
        //   ToastAndroid.SHORT
        // );
      }
    } else {
      var isEligible = await this.checkUserEligibilityForEndRide(
        bikeId,
        userId,
        email
      );

      if (isEligible) {
        var { bikeType, userName } = this.state;
        this.returnBike(bikeId, userId, bikeType, userName, email);
        Alert.alert("We hope you enjoyed your ride");
        this.setState({
          bikeAssigned: false
        });

        // For Android users only
        // ToastAndroid.show(
        //   "We hope you enjoyed your ride",
        //   ToastAndroid.SHORT
        // );
      }
    }
  };

  getBikeDetails = bikeId => {
    bikeId = bikeId.trim();
    db.collection("bicycles")
      .where("id", "==", bikeId)
      .get()
      .then(snapshot => {
        snapshot.docs.map(doc => {
          this.setState({
            bikeType: doc.data().bike_type
          });
        });
      });
  };

  getUserDetails = email => {
    db.collection("users")
      .where("email_id", "==", email)
      .get()
      .then(snapshot => {
        snapshot.docs.map(doc => {
          this.setState({
            userName: doc.data().name,
            userId: doc.data().id,
            bikeAssigned: doc.data().bike_assigned
          });
        });
      });
  };

  checkBikeAvailability = async bikeId => {
    const bikeRef = await db
      .collection("bicycles")
      .where("id", "==", bikeId)
      .get();

    var transactionType = "";
    if (bikeRef.docs.length == 0) {
      transactionType = false;
    } else {
      bikeRef.docs.map(doc => {
        if (!doc.data().under_maintenance) {
          //if the bike is available then transaction type will be rented
          // otherwise it will be return
          transactionType = doc.data().is_bike_available ? "rented" : "return";
        } else {
          transactionType = "under_maintenance";
          Alert.alert(doc.data().maintenance_message);
        }
      });
    }

    return transactionType;
  };

  checkUserEligibilityForStartRide = async (userId, email) => {
    const userRef = await db
      .collection("users")
      .where("id", "==", userId)
      .where("email_id", "==", email)
      .get();

    var isUserEligible = false;
    if (userRef.docs.length == 0) {
      this.setState({
        bikeId: ""
      });
      isUserEligible = false;
      Alert.alert("Invalid user id");
    } else {
      userRef.docs.map(doc => {
        if (!doc.data().bike_assigned) {
          isUserEligible = true;
        } else {
          isUserEligible = false;
          Alert.alert("End the current ride to rent another bike.");
          this.setState({
            bikeId: ""
          });
        }
      });
    }

    return isUserEligible;
  };

  checkUserEligibilityForEndRide = async (bikeId, userId, email) => {
    const transactionRef = await db
      .collection("transactions")
      .where("bike_id", "==", bikeId)
      .where("email_id", "==", email)
      .limit(1)
      .get();
    var isUserEligible = "";
    transactionRef.docs.map(doc => {
      var lastBikeTransaction = doc.data();
      if (lastBikeTransaction.user_id === userId) {
        isUserEligible = true;
      } else {
        isUserEligible = false;
        Alert.alert("This bike is rented by another user");
        this.setState({
          bikeId: ""
        });
      }
    });
    return isUserEligible;
  };

  assignBike = async (bikeId, userId, bikeType, userName, email) => {
    //add a transaction
    db.collection("transactions").add({
      user_id: userId,
      user_name: userName,
      bike_id: bikeId,
      bike_type: bikeType,
      date: firebase.firestore.Timestamp.now().toDate(),
      transaction_type: "rented",
      email_id: email
    });
    //change bike status
    db.collection("bicycles")
      .doc(bikeId)
      .update({
        is_bike_available: false
      });
    //change value  of bike assigned for user
    db.collection("users")
      .doc(userId)
      .update({
        bike_assigned: true
      });

    // Updating local state
    this.setState({
      bikeId: ""
    });
  };

  returnBike = async (bikeId, userId, bikeType, userName, email) => {
    //add a transaction
    db.collection("transactions").add({
      user_id: userId,
      user_name: userName,
      bike_id: bikeId,
      bike_type: bikeType,
      date: firebase.firestore.Timestamp.now().toDate(),
      transaction_type: "return",
      email_id: email
    });
    //change bike status
    db.collection("bicycles")
      .doc(bikeId)
      .update({
        is_bike_available: true
      });
    //change value  of bike assigned for user
    db.collection("users")
      .doc(userId)
      .update({
        bike_assigned: false
      });

    // Updating local state
    this.setState({
      bikeId: ""
    });
  };

  render() {
    const { bikeId, userId, domState, scanned, bikeAssigned } = this.state;
    if (domState !== "normal") {
      return (
        <BarCodeScanner
          onBarCodeScanned={scanned ? undefined : this.handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
      );
    }
    return (
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        <View style={styles.upperContainer}>
          <Image source={appIcon} style={styles.appIcon} />
          <Text style={styles.title}>e-ride</Text>
          <Text style={styles.subtitle}>A Eco-Friendly Ride</Text>
        </View>
        <View style={styles.lowerContainer}>
          <View style={styles.textinputContainer}>
            <TextInput
              style={[styles.textinput, { width: "82%" }]}
              onChangeText={text => this.setState({ userId: text })}
              placeholder={"User Id"}
              placeholderTextColor={"#FFFFFF"}
              value={userId}
            />
          </View>
          <View style={[styles.textinputContainer, { marginTop: 25 }]}>
            <TextInput
              style={styles.textinput}
              onChangeText={text => this.setState({ bikeId: text })}
              placeholder={"Bicycle Id"}
              placeholderTextColor={"#FFFFFF"}
              value={bikeId}
              autoFocus
            />
            <TouchableOpacity
              style={styles.scanbutton}
              onPress={() => this.getCameraPermissions()}
            >
              <Text style={styles.scanbuttonText}>Scan</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, { marginTop: 25 }]}
            onPress={this.handleTransaction}
          >
            <Text style={styles.buttonText}>
              {bikeAssigned ? "End Ride" : "Unlock"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#D0E6F0"
  },
  bgImage: {
    flex: 1,
    resizeMode: "cover",
    justifyContent: "center"
  },
  upperContainer: {
    flex: 0.5,
    justifyContent: "center",
    alignItems: "center"
  },
  appIcon: {
    width: 200,
    height: 200,
    resizeMode: "contain",
    marginTop: 80
  },
  title: {
    fontSize: 40,
    fontFamily: "Rajdhani_600SemiBold",
    paddingTop: 20,
    color: "#4C5D70"
  },
  subtitle: {
    fontSize: 20,
    fontFamily: "Rajdhani_600SemiBold",
    color: "#4C5D70"
  },
  lowerContainer: {
    flex: 0.5,
    alignItems: "center"
  },
  textinputContainer: {
    borderWidth: 2,
    borderRadius: 10,
    flexDirection: "row",
    backgroundColor: "#4C5D70",
    borderColor: "#4C5D70"
  },
  textinput: {
    width: "57%",
    height: 50,
    padding: 10,
    borderColor: "#4C5D70",
    borderRadius: 10,
    borderWidth: 3,
    fontSize: 18,
    backgroundColor: "#F88379",
    fontFamily: "Rajdhani_600SemiBold",
    color: "#FFFFFF"
  },
  scanbutton: {
    width: 100,
    height: 50,
    backgroundColor: "#FBE5C0",
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    justifyContent: "center",
    alignItems: "center"
  },
  scanbuttonText: {
    fontSize: 24,
    color: "#4C5D70",
    fontFamily: "Rajdhani_600SemiBold"
  },
  button: {
    width: "43%",
    height: 55,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FBE5C0",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#4C5D70"
  },
  buttonText: {
    fontSize: 24,
    color: "#4C5D70",
    fontFamily: "Rajdhani_600SemiBold"
  }
});
