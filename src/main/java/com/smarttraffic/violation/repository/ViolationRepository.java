package com.smarttraffic.violation.repository;

import com.smarttraffic.violation.entity.Violation;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface ViolationRepository extends JpaRepository<Violation, Long>, JpaSpecificationExecutor<Violation> {

    @Query("select coalesce(sum(v.fine), 0) from Violation v")
    long sumAllFines();

    @Query("select v.zone, count(v) from Violation v group by v.zone")
    List<Object[]> countViolationsByZone();
}
