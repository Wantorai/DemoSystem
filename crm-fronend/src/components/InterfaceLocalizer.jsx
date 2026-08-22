"use client";

import { useEffect } from "react";
import { language, translate } from "../i18n/translations";

const attributes = ["placeholder", "title", "aria-label", "alt"];

function localizeNode(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    const translated = translate(root.nodeValue);
    if (translated !== root.nodeValue) root.nodeValue = translated;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  for (const name of attributes) {
    if (root.hasAttribute(name)) {
      const current = root.getAttribute(name);
      const translated = translate(current);
      if (translated !== current) root.setAttribute(name, translated);
    }
  }
  for (const element of root.querySelectorAll("[placeholder], [title], [aria-label], [alt]")) {
    for (const name of attributes) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      const translated = translate(current);
      if (translated !== current) element.setAttribute(name, translated);
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) localizeNode(walker.currentNode);
}

export default function InterfaceLocalizer() {
  useEffect(() => {
    document.documentElement.lang = language === "eng" ? "en" : "ru";
    if (language !== "eng") return undefined;

    localizeNode(document.body);
    document.title = translate(document.title);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") localizeNode(mutation.target);
        if (mutation.type === "attributes") localizeNode(mutation.target);
        for (const node of mutation.addedNodes) localizeNode(node);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: attributes,
    });
    const titleObserver = new MutationObserver(() => {
      const translated = translate(document.title);
      if (translated !== document.title) document.title = translated;
    });
    const title = document.querySelector("title");
    if (title) titleObserver.observe(title, { childList: true, subtree: true, characterData: true });

    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    window.alert = (message) => originalAlert.call(window, translate(String(message)));
    window.confirm = (message) => originalConfirm.call(window, translate(String(message)));

    return () => {
      observer.disconnect();
      titleObserver.disconnect();
      window.alert = originalAlert;
      window.confirm = originalConfirm;
    };
  }, []);

  return null;
}
