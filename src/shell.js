// 通用壳引导：按 ?pet=<petId> 依序加载该宠 manifest.js（注入 window.PET_MANIFEST）与 renderer
(() => {
  const petId = new URLSearchParams(location.search).get('pet') || 'jielpeita';
  const s1 = document.createElement('script');
  s1.src = `../assets/pets/${petId}/manifest.js`;
  s1.onerror = () => console.warn('[shell] manifest missing:', petId);
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.type = 'module';
    s2.src = `./pets/${petId}/renderer.js`;
    s2.onerror = () => console.error('[shell] renderer missing:', petId);
    document.body.appendChild(s2);
  };
  document.body.appendChild(s1);
})();
