function renderAdminMenu(host,data,keepDraft=false) {
  if(!keepDraft) state.menuDraft=structuredClone(data.menu);
  const changed=JSON.stringify(state.menuDraft)!==JSON.stringify(data.menu);
  const photoKeys={breakfast:'photoBreakfast',lunch:'photoLunch',dinner:'photoDinner',nonvegLunch:'photoLunch',nonvegDinner:'photoDinner'};
  const labels={breakfast:'Breakfast',lunch:'Lunch · veg',dinner:'Dinner · veg',nonvegLunch:'Lunch · non-veg',nonvegDinner:'Dinner · non-veg'};
  const fieldValue=(row,field)=>row[field]??row[field==='nonvegLunch'?'nonveg_lunch':field==='nonvegDinner'?'nonveg_dinner':field]??'';
  const cell=(row,index,field)=>{
    const meal=field.includes('Lunch')||field==='lunch'?'lunch':field.includes('Dinner')||field==='dinner'?'dinner':'breakfast';
    const nonveg=field.startsWith('nonveg');
    const value=fieldValue(row,field);
    return `<button class="menu-cell ${nonveg?'menu-cell-nonveg':''}" type="button" data-edit-meal="${index}:${field}" aria-label="Edit ${safe(row.day)} ${safe(labels[field])}"><img class="menu-photo-preview" src="${safe(row[photoKeys[field]]||'/images/meal-fallback.svg')}" alt="${safe(row.day)} ${safe(labels[field])} dish" loading="lazy"><span class="menu-cell-copy"><span class="menu-cell-type"><i class="ticket-color ${meal} ${nonveg?'nonveg':''}"></i>${nonveg?'NON-VEG':field==='breakfast'?'BREAKFAST':'VEG'}</span><strong>${safe(value||'Add a dish')}</strong></span><span class="menu-cell-edit" aria-hidden="true">Edit</span></button>`;
  };
  host.innerHTML=`<div class="page-heading menu-editor-heading"><div><span class="eyebrow">MESS TEAM / MENU PLANNING</span><h1>Weekly menu<span class="brand-dot">.</span></h1><p>One week. Every plate. Select a dish to make changes.</p></div><div class="menu-save-actions"><button class="button button-outline" id="discardMenu" ${changed?'':'disabled'}>Discard</button><button class="button button-coral" id="saveMenu" ${changed?'':'disabled'}>Save & notify ↗</button></div></div>
    <div class="menu-planning-bar"><div class="menu-change-status ${changed?'dirty':''}"><i></i><span>${changed?'Unsaved changes':'No unsaved changes'}</span></div><span class="menu-edit-hint">Click a meal to edit dishes or change its photo ↗</span></div>
    <section class="menu-planner"><div class="menu-planner-scroll"><table class="admin-menu-timetable"><thead><tr><th scope="col">DAY</th><th scope="col">BREAKFAST <small>Pack ₹25 · same-day ₹32</small></th><th scope="col">LUNCH <small>Pack ₹50 · same-day ₹60</small></th><th scope="col">DINNER <small>Pack ₹50 · same-day ₹60</small></th></tr></thead><tbody>${state.menuDraft.map((row,i)=>{const service=['Wednesday','Friday','Sunday'].includes(row.day);return `<tr><th scope="row" class="menu-day"><strong>${safe(row.day)}</strong><span class="menu-service ${service?'with-nonveg':''}">${service?'Veg + non-veg':'Vegetarian'}</span></th><td>${cell(row,i,'breakfast')}</td><td>${cell(row,i,'lunch')}${service?cell(row,i,'nonvegLunch'):''}</td><td>${cell(row,i,'dinner')}${service?cell(row,i,'nonvegDinner'):''}</td></tr>`}).join('')}</tbody></table></div><div class="menu-planner-footer"><span>Non-veg options: Wednesday, Friday & Sunday</span><span>Saved menu changes notify students.</span></div></section>`;
  host.querySelectorAll('img.menu-photo-preview').forEach(img=>img.addEventListener('error',()=>{if(!img.src.endsWith('/images/meal-fallback.svg'))img.src='/images/meal-fallback.svg';}));
  host.querySelectorAll('[data-edit-meal]').forEach(button=>button.addEventListener('click',()=>{
    const [index,field]=button.dataset.editMeal.split(':');
    openMenuMealEditor(Number(index),field,labels[field],photoKeys[field],fieldValue(state.menuDraft[index],field),()=>renderAdminMenu(host,data,true));
  }));
  host.querySelector('#discardMenu').addEventListener('click',()=>renderAdminMenu(host,data));
  host.querySelector('#saveMenu').addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='Saving…';
    try {
      const result=await api('/admin/menu',{method:'PUT',body:{menu:state.menuDraft}});
      state.data=await api('/admin/overview');
      renderAdminMenu(host,state.data);
      toast(`Menu saved. ${result.notificationsSent} student notices sent.`);
    } catch(error) {toast(error.message,'error');button.disabled=false;button.textContent='Save & notify ↗';}
  });
}

function openMenuMealEditor(index,field,label,photoKey,value,onApply) {
  const row=state.menuDraft[index],photo=row[photoKey]||'/images/meal-fallback.svg';
  showModal(`<div class="meal-edit-heading"><span class="eyebrow">${safe(row.day.toUpperCase())} / EDIT MEAL</span><h2 id="modalTitle">${safe(label)}</h2></div><form id="mealEditForm"><div class="meal-edit-photo"><img class="menu-photo-preview" src="${safe(photo)}" alt="${safe(label)} dish photo"><button class="photo-edit-button" id="editPhoto" type="button" aria-expanded="false">Edit photo</button></div><div id="photoEditor" class="meal-photo-editor hidden"><label for="mealPhotoUrl">Image URL</label><input class="photo-url hidden" id="mealPhotoUrl" type="text" value="${safe(row[photoKey]||'')}" placeholder="https://…"><button class="button button-outline" id="applyPhoto" type="button">Apply photo</button><span class="photo-status hidden" role="status">Could not load image. Check the URL and try again.</span>${field.startsWith('nonveg')?'<small>Photo is shared with the vegetarian option for this meal.</small>':''}</div><label for="mealDishName">Dishes on the plate</label><textarea id="mealDishName" rows="3" maxlength="180" ${field.startsWith('nonveg')?'':'required'}>${safe(value)}</textarea><p class="meal-edit-help">Separate dishes with ·. Meal prices stay fixed.</p><div class="meal-edit-actions"><button class="button button-outline" id="cancelMealEdit" type="button">Cancel</button><button class="button button-dark" type="submit">Apply changes ↗</button></div></form>`);
  const form=document.querySelector('#mealEditForm'),preview=form.querySelector('.menu-photo-preview'),input=form.querySelector('.photo-url'),control=form.querySelector('#photoEditor'),status=form.querySelector('.photo-status'),edit=form.querySelector('#editPhoto');
  let draftPhoto=row[photoKey]||'',failed=false;
  const expand=()=>{control.classList.remove('hidden');input.classList.remove('hidden');edit.setAttribute('aria-expanded','true');};
  const collapse=()=>{control.classList.add('hidden');input.classList.add('hidden');status.classList.add('hidden');edit.setAttribute('aria-expanded','false');};
  preview.addEventListener('error',()=>{
    if(failed)return;failed=true;expand();status.classList.remove('hidden');preview.src='/images/meal-fallback.svg';
  });
  preview.addEventListener('load',()=>{if(!failed)collapse();});
  if(preview.complete&&!preview.naturalWidth)preview.dispatchEvent(new Event('error'));
  edit.addEventListener('click',()=>{if(control.classList.contains('hidden')){expand();input.focus();}else collapse();});
  form.querySelector('#applyPhoto').addEventListener('click',()=>{
    failed=false;draftPhoto=input.value.trim();status.classList.add('hidden');
    preview.src=input.value.trim()||'/images/meal-fallback.svg';
    if(preview.complete&&preview.naturalWidth)collapse();
  });
  form.querySelector('#cancelMealEdit').addEventListener('click',closeModal);
  form.addEventListener('submit',event=>{
    event.preventDefault();const dish=form.querySelector('#mealDishName').value.trim();
    if(!dish&&!field.startsWith('nonveg')){form.querySelector('#mealDishName').setCustomValidity('Enter at least one dish.');form.reportValidity();return;}
    row[field]=dish;row[photoKey]=draftPhoto;closeModal();onApply();
  });
  form.querySelector('#mealDishName').addEventListener('input',event=>event.target.setCustomValidity(''));
}
