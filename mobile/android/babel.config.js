/**
 * RxGuard Mobile — babel.config.js
 *
 * Adds module-resolver so tsconfig path aliases (@constants, @services, etc.)
 * work at runtime in the Metro bundler.
 */

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@'           : './src',
          '@navigation' : './src/navigation',
          '@services'   : './src/services',
          '@context'    : './src/context',
          '@hooks'      : './src/hooks',
          '@utils'      : './src/utils',
          '@constants'  : './src/constants',
          '@types'      : './src/types',
          '@screens'    : './src/screens',
          '@components' : './src/components',
          '@assets'     : './src/assets',
        },
      },
    ],
    'react-native-reanimated/plugin', // must be last
  ],
};