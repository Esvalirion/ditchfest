import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useSessionStore } from './stores/session';
import './styles/tokens.css';
import './styles/base.css';

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);

// Must run before mount — before any component reads the session — same
// contract js/core.js had (consumeRedirect ran at script-parse time).
useSessionStore().consumeRedirect();

app.mount('#app');
