export function el(tag, attrs, ...children) {
    const element = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "className")
                element.className = v;
            else
                element.setAttribute(k, v);
        }
    }
    for (const child of children) {
        element.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return element;
}
