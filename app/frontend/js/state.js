// App-wide state loaded from /api/bootstrap.
import { api } from './api.js';
import { setTimeZone } from './format.js';

export const state = {
  boot: null,
  get today() {
    return this.boot.today;
  },
  get enums() {
    return this.boot.enums;
  },
  get property() {
    return this.boot.property;
  }
};

export async function loadBootstrap() {
  state.boot = await api.get('/api/bootstrap');
  setTimeZone(state.boot.policy.timeZone);
  return state.boot;
}
