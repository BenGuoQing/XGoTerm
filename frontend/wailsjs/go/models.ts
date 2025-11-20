export namespace main {
	
	export class AuthInfo {
	    type: string;
	    password?: string;
	    key_pem?: string;
	    passphrase?: string;
	
	    static createFrom(source: any = {}) {
	        return new AuthInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.password = source["password"];
	        this.key_pem = source["key_pem"];
	        this.passphrase = source["passphrase"];
	    }
	}
	export class HostProfile {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    auth: AuthInfo;
	    keepAliveSec?: number;
	    timeoutSec?: number;
	    cols?: number;
	    rows?: number;
	    gatewayHost?: string;
	    gatewayPort?: number;
	    gatewayUser?: string;
	    gatewayAuth?: string;
	    gatewayPassword?: string;
	    gatewayKeyPEM?: string;
	    gatewayPassphrase?: string;
	    tags?: string[];
	    notes?: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new HostProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.auth = this.convertValues(source["auth"], AuthInfo);
	        this.keepAliveSec = source["keepAliveSec"];
	        this.timeoutSec = source["timeoutSec"];
	        this.cols = source["cols"];
	        this.rows = source["rows"];
	        this.gatewayHost = source["gatewayHost"];
	        this.gatewayPort = source["gatewayPort"];
	        this.gatewayUser = source["gatewayUser"];
	        this.gatewayAuth = source["gatewayAuth"];
	        this.gatewayPassword = source["gatewayPassword"];
	        this.gatewayKeyPEM = source["gatewayKeyPEM"];
	        this.gatewayPassphrase = source["gatewayPassphrase"];
	        this.tags = source["tags"];
	        this.notes = source["notes"];
	        this.updated_at = source["updated_at"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RemoteFile {
	    name: string;
	    path: string;
	    size: number;
	    mode: string;
	    modTime: number;
	    isDir: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RemoteFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.mode = source["mode"];
	        this.modTime = source["modTime"];
	        this.isDir = source["isDir"];
	    }
	}
	export class SSHParams {
	    Host: string;
	    Port: number;
	    Username: string;
	    Password: string;
	    AuthType: string;
	    KeyPEM: string;
	    Passphrase: string;
	    Cols: number;
	    Rows: number;
	    KeepAliveSec: number;
	    TimeoutSec: number;
	    GatewayHost: string;
	    GatewayPort: number;
	    GatewayUser: string;
	    GatewayAuth: string;
	    GatewayPassword: string;
	    GatewayKeyPEM: string;
	    GatewayPassphrase: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Host = source["Host"];
	        this.Port = source["Port"];
	        this.Username = source["Username"];
	        this.Password = source["Password"];
	        this.AuthType = source["AuthType"];
	        this.KeyPEM = source["KeyPEM"];
	        this.Passphrase = source["Passphrase"];
	        this.Cols = source["Cols"];
	        this.Rows = source["Rows"];
	        this.KeepAliveSec = source["KeepAliveSec"];
	        this.TimeoutSec = source["TimeoutSec"];
	        this.GatewayHost = source["GatewayHost"];
	        this.GatewayPort = source["GatewayPort"];
	        this.GatewayUser = source["GatewayUser"];
	        this.GatewayAuth = source["GatewayAuth"];
	        this.GatewayPassword = source["GatewayPassword"];
	        this.GatewayKeyPEM = source["GatewayKeyPEM"];
	        this.GatewayPassphrase = source["GatewayPassphrase"];
	    }
	}
	export class TransferProgress {
	    transferId: string;
	    transferred: number;
	    total: number;
	    percent: number;
	    speed: number;
	    status: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new TransferProgress(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.transferId = source["transferId"];
	        this.transferred = source["transferred"];
	        this.total = source["total"];
	        this.percent = source["percent"];
	        this.speed = source["speed"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}

}

