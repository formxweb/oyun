import './ui/styles.css';
import { App } from './app';

/**
 * Entry point. All platforms (web, Android via Capacitor, Steam via Electron) load this.
 */
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
try {
  const app = new App(canvas, ui);
  (window as unknown as { vertigo: App }).vertigo = app;
} catch (e) {
  console.error(e);
}
