//
//  URLSession.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Foundation

struct LoginRequest: Codable {
    let email: String
    let password: String
}

struct LoginResponse: Codable {
    let access_token: String
    let token_type: String
}

func login(email: String, password: String) {
    let url = URL(string: "http://127.0.0.1:8000/auth/login")!  // cambia con l'IP del server
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let body = LoginRequest(email: email, password: password)
    req.httpBody = try? JSONEncoder().encode(body)

    URLSession.shared.dataTask(with: req) { data, resp, err in
        if let err = err { print("Errore:", err); return }
        guard let data = data else { return }
        if let res = try? JSONDecoder().decode(LoginResponse.self, from: data) {
            print("Token:", res.access_token)
        } else {
            print("Risposta non decodificabile:", String(data: data, encoding: .utf8) ?? "")
        }
    }.resume()
}
