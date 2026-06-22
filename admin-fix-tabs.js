
// FIX EMERGENCIAL ABAS ADMIN - NAO DEPENDE DO admin.js
(function(){
  function $(id){return document.getElementById(id);}
  function titleOf(btn){
    return (btn.textContent || 'Painel').replace(/[^\wÀ-ÿ\s]/g,'').trim();
  }
  function openPage(page){
    document.querySelectorAll('.page').forEach(function(el){
      el.classList.remove('active');
      el.style.display='none';
    });
    document.querySelectorAll('.nav-item,[data-page]').forEach(function(el){
      el.classList.remove('active');
    });

    var target=document.getElementById(page);
    if(target){
      target.classList.add('active');
      target.style.display='block';
    }

    var btn=document.querySelector('[data-page="'+page+'"]');
    if(btn){
      btn.classList.add('active');
      var title=document.getElementById('pageTitle');
      var sub=document.getElementById('pageSubtitle');
      if(title) title.textContent=titleOf(btn);
      if(sub) sub.textContent=page==='dashboard'?'Resumo da ferramenta de divulgação':'Gerenciamento';
    }
    localStorage.setItem('ideal_last_admin_page',page);
  }

  function bootTabs(){
    document.querySelectorAll('[data-page]').forEach(function(btn){
      btn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        openPage(btn.getAttribute('data-page'));
      };
    });

    document.querySelectorAll('[data-page-go]').forEach(function(btn){
      btn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        openPage(btn.getAttribute('data-page-go'));
      };
    });

    var first=localStorage.getItem('ideal_last_admin_page') || 'dashboard';
    if(!document.getElementById(first)) first='dashboard';
    openPage(first);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',bootTabs);
  }else{
    bootTabs();
  }

  window.openAdminPageFixed=openPage;
})();
