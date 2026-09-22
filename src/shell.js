// 通用壳引导：按 ?pet=<petId> 依序加载该宠 manifest.js（注入 window.PET_MANIFEST）与 renderer
// manifest 缺失（新宠脚手架期）也要加载 renderer：模板对缺失 manifest 有兜底（占位卡展示）
(() => {
  const petId = new URLSearchParams(location.search).get('pet') || 'jielpeita';
  const loadRenderer = () => {
    const s2 = document.createElement('script');
    s2.type = 'module';
    s2.src = `./pets/${petId}/renderer.js`;
    s2.onerror = () => console.error('[shell] renderer missing:', petId);
    document.body.appendChild(s2);
  };
  const s1 = document.createElement('script');
  s1.src = `../assets/pets/${petId}/manifest.js`;
  s1.onerror = () => { console.warn('[shell] manifest missing:', petId); loadRenderer(); };
  s1.onload = loadRenderer;
  document.body.appendChild(s1);
})();
