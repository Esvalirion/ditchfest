<script setup>
// Parallax for the fixed page background (body::before in base.css).
// Renders nothing — just wires the mousemove listener that used to live in
// js/background.js, mounted once from App.vue so it's identical site-wide.
import { onMounted, onUnmounted } from 'vue';

function handleMouseMove(e) {
  const x = (e.clientX / window.innerWidth - 0.5) * 4; // up to 4px offset
  const y = (e.clientY / window.innerHeight - 0.5) * 4;
  document.body.style.setProperty('--bg-x', `${x}px`);
  document.body.style.setProperty('--bg-y', `${y}px`);
}

onMounted(() => window.addEventListener('mousemove', handleMouseMove));
onUnmounted(() => window.removeEventListener('mousemove', handleMouseMove));
</script>

<template></template>
