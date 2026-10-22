/**
 * Enquiry cart — localStorage backed, no backend.
 * The cart collects items and generates a WhatsApp order message.
 * Shared by the drawer (all pages) and /cart/ (full page + enquiry form).
 */

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string;
  slug: string;
}

const KEY = 'globehk_cart_v1';

export function getCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setCart(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart:update', { detail: items }));
}

export function addToCart(item: Omit<CartItem, 'qty'>, qty = 1) {
  const items = getCart();
  const found = items.find((i) => i.id === item.id);
  if (found) found.qty += qty;
  else items.push({ ...item, qty });
  setCart(items);
}

export function updateQty(id: string, qty: number) {
  let items = getCart();
  if (qty <= 0) items = items.filter((i) => i.id !== id);
  else {
    const found = items.find((i) => i.id === id);
    if (found) found.qty = qty;
  }
  setCart(items);
}

export function removeFromCart(id: string) {
  setCart(getCart().filter((i) => i.id !== id));
}

export function cartCount(items: CartItem[]) {
  return items.reduce((n, i) => n + i.qty, 0);
}

export function cartTotal(items: CartItem[]) {
  return items.reduce((n, i) => n + i.price * i.qty, 0);
}

export function fmtPrice(n: number) {
  return n ? `$${n.toLocaleString('zh-HK')}` : '查詢';
}

/** Build the WhatsApp order message. */
export function buildWaMessage(items: CartItem[], name = '', phone = '', note = '') {
  const lines: string[] = [];
  lines.push('【GlobeHK 地球儀查詢單】');
  lines.push('');
  items.forEach((i, n) => {
    lines.push(`${n + 1}. ${i.name}`);
    lines.push(`   數量：${i.qty}  單價：${fmtPrice(i.price)}  小計：${fmtPrice(i.price * i.qty)}`);
  });
  lines.push('');
  lines.push(`合計：${fmtPrice(cartTotal(items))}`);
  if (name) lines.push(`稱呼：${name}`);
  if (phone) lines.push(`電話：${phone}`);
  if (note) lines.push(`備註：${note}`);
  lines.push('');
  lines.push('請確認庫存、運費及到貨日期，謝謝！');
  return lines.join('\n');
}
