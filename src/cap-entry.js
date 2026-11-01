// Bundled into www/cap.js by esbuild. Exposes the native plugins to app.js without a bundler in the app itself.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
window.Cap = { Capacitor, App, Camera, CameraResultType, CameraSource, Haptics, ImpactStyle, NotificationType, LocalNotifications };
