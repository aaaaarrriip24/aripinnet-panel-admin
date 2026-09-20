<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref('');

async function submit() {
  error.value = '';
  try {
    await auth.login(email.value, password.value);
    router.push(route.query.next || { name: 'dashboard' });
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<template>
  <div class="login-wrap">
    <form class="card login-card" @submit.prevent="submit">
      <h1>Panel Billing</h1>
      <p class="muted small" style="margin-bottom: 20px">Masuk dengan akun admin</p>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="username" required autofocus>
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required>
      </div>

      <button type="submit" class="block" :disabled="auth.loading">
        <span v-if="auth.loading" class="spinner"></span>
        {{ auth.loading ? 'Memeriksa...' : 'Masuk' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
}
.login-card { width: 100%; max-width: 380px; padding: 24px; margin: 0; }
</style>
