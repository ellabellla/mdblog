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
    
    pages = pages.sort((a, b) => a.priority - b.priority);

    for (page of pages) {
        let link = document.createElement("a");
        link.href = `#${page.name}`;
        link.innerHTML = page.name;
        nav.appendChild(link);
    }

    document.getElementsByTagName("article").innerHTML = pages[0].render(null);

    console.log(await Promise.all(pages.map(m=> m.contents())))
}

class Page {
    constructor(priority, name, url) {
        this.priority = priority;
        this.name = name;
        this.url = url;
    }

    async contents() {
        return []
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
        return fetch_static(this.url)
    }

    async render(converter) {
        return fetch_static(this.url)
    }
}

class Blog extends Page {
    constructor(priority, name, url) {
        super(priority, name, url)
    }

    async contents() {
        return fetch_blog(this.url)
    }

    async render(converter) {
        // todo
    }
}

async function fetch_page_data(meta) {
    let user = meta?.user;
    let repo = meta?.repo;

    if (user === undefined || repo === undefined
        || user === "" || repo === "") {
            throw new Error("Please provide a github username and repo to load the blog from");
    }


    return await fetch(`https://api.github.com/repos/${user}/${repo}/contents/`)
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