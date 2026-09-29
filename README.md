# BloodLink — Backend

Blood Donor Registry and Search System. Spring Boot 4.1.1, Java 17, Maven, MySQL.

## Tech Stack
- Java 17
- Spring Boot 4.1.1 (Web, Data JPA, Validation)
- Maven
- MySQL

## Project Structure
```
backend/
├── pom.xml
├── src/main/java/com/bloodlink/bloodlink/
│   ├── BloodlinkApplication.java
│   ├── controller/DonorController.java
│   ├── service/DonorService.java
│   ├── repository/BloodGroupRepository.java
│   ├── repository/DonorRepository.java
│   ├── repository/DonationRecordRepository.java
│   ├── entity/BloodGroup.java
│   ├── entity/BloodGroupCode.java
│   ├── entity/Donor.java
│   ├── entity/DonationRecord.java
│   ├── dto/DonorRequest.java
│   ├── exception/ResourceNotFoundException.java
│   ├── exception/GlobalExceptionHandler.java
│   ├── config/CorsConfig.java
│   └── config/DataInitializer.java
└── src/main/resources/application.properties
```

## 1. MySQL Setup
Open MySQL Workbench (or the CLI) and run:
```sql
CREATE DATABASE bloodlink;
```
Tables are created/updated automatically by Hibernate (`ddl-auto=update`) — you do not need to create them by hand.

## 2. Configure the password
Edit `src/main/resources/application.properties` and replace `YOUR_MYSQL_PASSWORD`
with your actual MySQL root password.

## 3. Run in IntelliJ IDEA
1. Open the `backend` folder as a Maven project.
2. File → Project Structure → set Project SDK to Java 17.
3. Reload Maven (the little refresh icon in the Maven tool window).
4. Confirm `application.properties` has the right DB password.
5. Run `BloodlinkApplication.java` (green ▶ button).
6. Console should end with something like:
   ```
   Tomcat started on port 8080 (http)
   Started BloodlinkApplication in X.XXX seconds
   ```
7. Visit `http://localhost:8080/api/donors` — you should get `[]` (empty list) on first run.

## API Endpoints

| Action              | Method | URL                                              |
|---------------------|--------|---------------------------------------------------|
| Register donor      | POST   | /api/donors                                       |
| Get all donors      | GET    | /api/donors                                       |
| Get donor by ID     | GET    | /api/donors/{id}                                  |
| Search donors       | GET    | /api/donors/search?bloodGroup=O_POSITIVE&city=Coimbatore |
| Record donation     | POST   | /api/donors/{id}/donate                           |
| Count by blood group| GET    | /api/donors/count?bloodGroup=O_POSITIVE           |

### Register donor — sample body
```json
{
  "name": "Arun Kumar",
  "phone": "9876543210",
  "city": "Coimbatore",
  "bloodGroup": "O_POSITIVE"
}
```

## 90-Day Cooldown — How It Works
- On `POST /api/donors/{id}/donate`, the donor's `lastDonationDate` is set to today and `available` is set to `false`.
- Whenever a donor is read, listed, or searched, the service compares `lastDonationDate + 90 days` to today.
  - If 90 days have **not** passed → donor stays `available = false` and is excluded from search results.
  - If 90 days **have** passed → donor is flipped back to `available = true` and saved, then included in search results.
- No scheduler is used — the check happens on read, which satisfies the requirement without added complexity.

## Testing the 90-Day Rule Without Waiting
1. Register a donor and record a donation (`available` becomes `false`).
2. Search for that donor by blood group + city → donor should **not** appear.
3. In MySQL Workbench, manually backdate the donation:
   ```sql
   UPDATE donor
   SET last_donation_date = DATE_SUB(CURDATE(), INTERVAL 91 DAY)
   WHERE id = 1;
   ```
4. Search again → the donor should now appear (the service auto-flips `available` back to `true` on read).

## MySQL Workbench Verification
```sql
USE bloodlink;
SHOW TABLES;
SELECT * FROM blood_group;     -- the 8 fixed blood group codes
SELECT * FROM donor;           -- registered donors
SELECT * FROM donation_record; -- one row per recorded donation
```
