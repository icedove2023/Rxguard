/**
 * RxGuard — index.js
 * React Native application entry point.
 */

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

// Gesture handler must be registered at the top level
import 'react-native-gesture-handler';

AppRegistry.registerComponent(appName, () => App);