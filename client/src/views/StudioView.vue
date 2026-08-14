<!-- Dedicated route page for the Sign Studio builder. The studio used to live
     as a fake "filter" tab inside SignsView; moving it to its own route keeps
     the gallery and the builder decoupled and gives the studio room to grow
     (format selector, presets, etc.). meta.navGroup: 'signs' makes the NavBar
     highlight the Signs tab here, the same way /map/:uid highlights Maps. -->
<script setup>
import SignStudio from '../components/SignStudio.vue';
</script>

<template>
  <SignStudio />
</template>
