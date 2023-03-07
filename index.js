fetch("./meta.json")
    .then((res) => res.json())
    .then((meta) => fetch_page_data(meta))
    .then(data => load(data))
    .catch((e) => failed(e));

function failed(err) {
    document.getElementsByTagName("article")[0].innerHTML = `${err}`
}

async function load(pages) {
    let nav = document.getElementsByTagName("nav")[0];
    
    pages = pages.sort((a, b) => b.priority - a.priority);

    for (let page of pages) {
        let link = document.createElement("a");
        link.href = `#${page.name}`;
        link.innerHTML = page.name;
        nav.appendChild(link);
    }

    var converter = new showdown.Converter();
    
    let name = location.hash === "" ? pages[0].name : location.hash.slice(1);
    render_by_name(name, pages, converter);

    window.onhashchange = function () {
        let name = location.hash.slice(1);
        render_by_name(name, pages, converter);
    };

    console.log(await Promise.all(pages.map(m=> m.contents())))
}

function render_by_name(name, pages, converter) {
    let page = pages.find(item => item.name === name);
    if (page != undefined) {
        page.render(converter)
            .then(html => document.getElementsByTagName("article")[0].innerHTML = html)
            .catch(e => failed(e));
    } else {
        failed("Unable to find page")
    }
}



class Page {
    constructor(priority, name, url) {
        this.priority = priority;
        this.name = name;
        this.url = url;
    }

    async contents() {
        return ""
    }

    async render(converter) {
        return "";
    }
}

class Static extends Page {
    constructor(priority, name, url) {
        super(priority, name, url)
    }

    async contents() {
        return await fetch_static(this.url)
    }

    async render(converter) {
        let data = await fetch_static(this.url);
        return converter.makeHtml(data);
    }
}

class Blog extends Page {
    constructor(priority, name, url) {
        super(priority, name, url)
    }

    async contents() {
        return await fetch_blog(this.url)
    }

    async render(converter) {
        let posts = await fetch_blog(this.url);
        posts = posts.sort((a, b) => b.priority - a.priority);

        let data = "";
        for (let post of posts) {
            data += await post.render(converter);
        }

        return data;
    }
}

async function fetch_page_data(meta) {
    let user = meta?.user;
    let repo = meta?.repo;

    if (user === undefined || repo === undefined
        || user === "" || repo === "") {
            throw new Error("Please provide a github username and repo to load the blog from");
    }


    return await fetch(`https://api.github.com/repos/${user}/${repo}/contents/www`)
        .then(async (res) => res.json())
        .then(async (contents) => Promise.all(contents.map(async (item) => {
            if (is_file(item)) {
                let [priority, name] = parse_name(item.name);
                return new Static(priority, name, item.download_url);
            } else if (is_dir(item)) {
                let [priority, name] = parse_name(item.name);
                return new Blog(priority, name, item.url);
            } else {
                throw new Error(`Unable to process file, ${item?.name}`)
            }
        })))
}

function parse_name(name) {
    let info = name.split(".")[0];
    if (info.length === 0) {
        return [0, name];
    }
    let [priority, parsed_name] = info.split("|");
    return parsed_name === undefined ? [0, info] : [priority, parsed_name];
}

async function fetch_static(url) {
    return fetch(url)
        .then((res) => {
            if (res.ok) {
                return res.text()
            } else {
                throw new Error(`Unable to fetch page contents, ${url}`)
            }
        });
}

async function fetch_blog(url) {
    return (
        await fetch(url)
            .then((res) => res.json())
            .then((item) => Promise.all(item.map(async item => {
                if (is_file(item)) {
                    let [priority, name] = parse_name(item.name);
                    return new Static(priority, name, item.download_url);
                }
            })))
    ).filter(item => item !== undefined)
}

function is_file(item) {
    return item?.type === "file" && "download_url" in item && item.download_url != null && "name" in item
}

function is_dir(item) {
    return item?.type === "dir" && "url" in item && item.url != null && "name" in item
}