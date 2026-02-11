//
//  SignUpLogic.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Foundation

struct RegisterRequest: Codable {
    let email: String
    let username: String
    let password: String
}

struct RegisterResponse: Codable {
    let id: Int
    let message: String
    // opzionale: access_token se decidete di loggare subito
}

func register(email: String, username: String, password: String) {
    guard let url = URL(string: "http://127.0.0.1:8000/auth/register") else {
        print("Errore: URL non valido")
        return
    }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let body = RegisterRequest(email: email, username: username, password: password)
    req.httpBody = try? JSONEncoder().encode(body)

    URLSession.shared.dataTask(with: req) { data, _, err in
        if let err = err { print("Errore:", err); return }
        guard let data = data else { return }

        if let res = try? JSONDecoder().decode(RegisterResponse.self, from: data) {
            print("Registrato:", res.id, res.message)
        } else {
            print("Risposta:", String(data: data, encoding: .utf8) ?? "")
        }
    }.resume()
}
