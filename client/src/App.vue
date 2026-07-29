<script setup>
import { RouterLink, RouterView } from 'vue-router';
import NavBar from './components/NavBar.vue';
import AuthWidget from './components/AuthWidget.vue';
import SiteFooter from './components/SiteFooter.vue';
import ParallaxBackground from './components/ParallaxBackground.vue';
import MapPreviewOverlay from './components/MapPreviewOverlay.vue';
import VotersPopoverOverlay from './components/VotersPopoverOverlay.vue';
</script>

<template>
  <ParallaxBackground />
  <MapPreviewOverlay />
  <VotersPopoverOverlay />

  <div class="content-wrapper">
    <div id="site-header">
      <NavBar />
      <AuthWidget />
      <div class="logo-container">
        <RouterLink to="/">
          <img class="main-logo" src="/res/DitchFest_logo.svg" alt="Ditchfest Signs" />
        </RouterLink>
      </div>
    </div>

    <RouterView />
  </div>

  <SiteFooter />
</template>

<style scoped>
.logo-container {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
  margin-top: 30px;
}

.logo-container a {
  display: block;
  width: 90%;
  max-width: 300px;
  line-height: 0;
}

.main-logo {
  display: block;
  width: 100%;
  height: auto;
  opacity: 1;
}
</style>
