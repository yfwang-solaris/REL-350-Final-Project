'use strict';
{
const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const modal=$('dialog');let opener;
for(const button of all('[data-image]')){
  const img=button.querySelector('img');
  function ready(){
    button.disabled=!img.naturalWidth;
    button.setAttribute('aria-label',(button.disabled?'Image pending: ':'Enlarge ')+img.alt);
    img.classList.toggle('loaded',!button.disabled);
  }
  img.addEventListener('load',ready);img.addEventListener('error',ready);ready();
  button.addEventListener('click',()=>{
    opener=button;$('#large').src=img.src;$('#large').alt=img.alt;$('#description').textContent=button.nextElementSibling.textContent;
    modal.showModal();$('#dismiss').focus();
  });
}
$('#dismiss').onclick=()=>modal.close();
modal.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();$('#dismiss').focus()}});
modal.addEventListener('close',()=>opener?.focus());
}
