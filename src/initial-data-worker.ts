import { InitialDataController, type InitialDataRequest } from './initial-data/controller.ts';
const controller = new InitialDataController();
self.onmessage = ({ data }: MessageEvent<InitialDataRequest>) =>
  self.postMessage(controller.handle(data));
