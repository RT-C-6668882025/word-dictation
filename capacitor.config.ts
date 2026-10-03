import type{CapacitorConfig}from'@capacitor/cli';
const config:CapacitorConfig={
 appId:'com.rtc.worddictation',appName:'Word Dictation',webDir:'dist',
 server:{androidScheme:'https'},
 // Capacitor supplies --safe-area-inset-* and resizes the window for the IME.
 plugins:{SystemBars:{insetsHandling:'css',style:'LIGHT',initialViewportFitValueHint:'cover'}}
};
export default config;
